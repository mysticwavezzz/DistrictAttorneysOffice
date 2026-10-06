import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "./prisma";
import { fetchRobloxGroupRoles } from "./roblox/groups";
import { ROBLOX_TIER_ROLE_MAPPINGS } from "@/config/roblox-role-mappings";
import { capabilityMarkersForTiers, resolveTiersFromRobloxRoles } from "./permissions/resolve";
import type { PermissionTier } from "./permissions/tiers";
import { withDeveloperProfile } from "@/config/developer-profiles";
import { hasActiveDeveloperProfile } from "./developer-profile-access";
import { normalizeRobloxTierRoleMappings } from "@/config/role-mapping-migrations";
import { mayUseCachedRoles } from "./role-refresh-policy";
import { migrateSavedAttorneyPermissions } from "./permissions/migrate-saved-config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account }) {
      return account?.provider === "roblox";
    },
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);

      // Reject legacy Discord sessions so old Discord-derived permissions
      // cannot survive this provider change.
      if (token.identityProvider !== "roblox" || !token.robloxUserId) return null;

      // JWT sessions are otherwise stateless. Bind each new sign-in to the
      // persisted generation so a full-data wipe can revoke every browser.
      const tokenWithGeneration = token as typeof token & { authSessionGeneration?: string };
      try {
        const generation = await prisma.siteConfiguration.findUnique({
          where: { key: "authSessionGeneration" },
          select: { value: true },
        });
        if (params.account) {
          const activeGeneration = generation ?? await prisma.siteConfiguration.upsert({
            where: { key: "authSessionGeneration" },
            create: { key: "authSessionGeneration", value: crypto.randomUUID() },
            update: {},
            select: { value: true },
          });
          tokenWithGeneration.authSessionGeneration = activeGeneration.value;
        } else if (
          !tokenWithGeneration.authSessionGeneration ||
          tokenWithGeneration.authSessionGeneration !== generation?.value
        ) {
          return null;
        }
      } catch (error) {
        console.error("Could not verify the active sign-in generation", error);
        // Fail closed: without this check, a reset could leave old JWTs usable.
        return null;
      }

      const custom = token as typeof token & { permissionModelVersion?: string; configuredRobloxRoleMappings?: typeof ROBLOX_TIER_ROLE_MAPPINGS; configuredTierCapabilities?: Record<string, string[]> };
      const needsPermissionRefresh = custom.permissionModelVersion !== "release-1.1.1";
      if (token.robloxUserId && (params.account || params.trigger === "update" || needsPermissionRefresh)) {
        try {
          await migrateSavedAttorneyPermissions();
          const [roles, mappingRow, capabilityRow] = await Promise.all([
            fetchRobloxGroupRoles(token.robloxUserId),
            prisma.siteConfiguration.findUnique({ where: { key: "robloxTierRoleMappings" } }),
            prisma.siteConfiguration.findUnique({ where: { key: "tierCapabilities" } }),
          ]);
          const mappings = normalizeRobloxTierRoleMappings(mappingRow ? JSON.parse(mappingRow.value) as typeof ROBLOX_TIER_ROLE_MAPPINGS : ROBLOX_TIER_ROLE_MAPPINGS);
          const tierCapabilities = capabilityRow ? JSON.parse(capabilityRow.value) as Record<string, string[]> : {};
          const tiers = resolveTiersFromRobloxRoles(roles, mappings);
          token.tiers = [...tiers, ...capabilityMarkersForTiers(tiers, tierCapabilities)] as PermissionTier[];
          custom.permissionModelVersion = "release-1.1.1";
          custom.configuredRobloxRoleMappings = mappings;
          custom.configuredTierCapabilities = tierCapabilities;
          token.tiersFetchedAt = Date.now();
        } catch (error) {
          console.error("Failed to resolve configured Roblox group permissions", error);
          if (needsPermissionRefresh || !mayUseCachedRoles(token.tiersFetchedAt, Date.now())) token.tiers = [];
        }
      }

      // The Developer Profile toggle is mutable while a JWT session remains
      // active, so never trust its cached tier. Rebuild the effective tiers
      // from the current persisted toggle on every server auth request.
      if (token.identityProvider === "roblox" && token.robloxUserId) {
        const custom = token as typeof token & { configuredTierCapabilities?: Record<string, string[]> };
        const baseTiers = (token.tiers ?? []).filter((tier) =>
          tier !== "developer_profile" && !tier.startsWith("cap:") && !tier.startsWith("denycap:")
        );
        const developerEnabled = await hasActiveDeveloperProfile({
          identityProvider: token.identityProvider,
          username: token.username,
          robloxUserId: token.robloxUserId,
        });
        const tiers = withDeveloperProfile(token.identityProvider, token.username, baseTiers, developerEnabled);
        token.tiers = [...tiers, ...capabilityMarkersForTiers(tiers, custom.configuredTierCapabilities ?? {})] as PermissionTier[];
      }

      if (params.account && params.profile) {
        try {
          const userData = {
            username: token.username ?? token.providerUserId ?? "unknown",
            displayName: token.identityProvider === "roblox" ? token.username ?? token.providerUserId ?? "unknown" : token.displayName ?? token.username ?? token.providerUserId ?? "unknown",
            avatarUrl: token.avatarUrl ?? null,
            tiers: (token.tiers ?? []).join(","),
            division: null as string | null,
          };
          if (token.identityProvider === "roblox" && token.robloxUserId) {
            const [rosterEntry, existingUser] = await Promise.all([
              prisma.rosterEntry.findUnique({ where: { robloxUserId: token.robloxUserId }, select: { unit: true } }),
              prisma.user.findUnique({ where: { robloxUserId: token.robloxUserId }, select: { division: true } }),
            ]);
            userData.division = rosterEntry?.unit ?? existingUser?.division ?? null;
            await prisma.user.upsert({
              where: { robloxUserId: token.robloxUserId },
              update: userData,
              create: { ...userData, robloxUserId: token.robloxUserId },
            });
          }
        } catch (error) {
          console.error("Failed to upsert local user record", error);
        }
      } else if (params.trigger === "update" && token.identityProvider === "roblox" && token.robloxUserId) {
        try {
          await prisma.user.updateMany({
            where: { robloxUserId: token.robloxUserId },
            data: { displayName: token.username ?? token.robloxUserId, username: token.username ?? token.robloxUserId, tiers: (token.tiers ?? []).join(",") },
          });
        } catch (error) {
          console.error("Failed to sync local Roblox user record", error);
        }
      }

      if (token.identityProvider === "roblox" && token.robloxUserId) {
        try {
          const linkedAccount = await prisma.user.findUnique({ where: { robloxUserId: token.robloxUserId }, select: { discordUserId: true } });
          token.discordUserId = linkedAccount?.discordUserId ?? "";
        } catch (error) {
          console.error("Failed to refresh the linked Discord identity", error);
        }
      }
      return token;
    },
  },
});

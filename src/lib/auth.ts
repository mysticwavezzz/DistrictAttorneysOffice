import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "./prisma";
import { fetchRobloxGroupRoles } from "./roblox/groups";
import { ROBLOX_TIER_ROLE_MAPPINGS } from "@/config/roblox-role-mappings";
import { capabilityMarkersForTiers, resolveTiersFromRobloxRoles } from "./permissions/resolve";
import type { PermissionTier } from "./permissions/tiers";
import { developerProfileSettingKey, isDeveloperProfileIdentity, withDeveloperProfile } from "@/config/developer-profiles";
import { normalizeRobloxTierRoleMappings } from "@/config/role-mapping-migrations";
import { mayUseCachedRoles } from "./role-refresh-policy";

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

      if (token.robloxUserId && (params.account || params.trigger === "update")) {
        try {
          const [roles, mappingRow, capabilityRow, developerProfileSetting] = await Promise.all([
            fetchRobloxGroupRoles(token.robloxUserId),
            prisma.siteConfiguration.findUnique({ where: { key: "robloxTierRoleMappings" } }),
            prisma.siteConfiguration.findUnique({ where: { key: "tierCapabilities" } }),
            isDeveloperProfileIdentity(token.identityProvider, token.username)
              ? prisma.siteConfiguration.findUnique({ where: { key: developerProfileSettingKey(token.robloxUserId) } })
              : Promise.resolve(null),
          ]);
          const mappings = normalizeRobloxTierRoleMappings(mappingRow ? JSON.parse(mappingRow.value) as typeof ROBLOX_TIER_ROLE_MAPPINGS : ROBLOX_TIER_ROLE_MAPPINGS);
          const tierCapabilities = capabilityRow ? JSON.parse(capabilityRow.value) as Record<string, string[]> : {};
          const tiers = withDeveloperProfile(token.identityProvider, token.username, resolveTiersFromRobloxRoles(roles, mappings), developerProfileSetting?.value === "true");
          token.tiers = [...tiers, ...capabilityMarkersForTiers(tiers, tierCapabilities)] as PermissionTier[];
          const custom = token as typeof token & { configuredRobloxRoleMappings?: typeof mappings; configuredTierCapabilities?: typeof tierCapabilities };
          custom.configuredRobloxRoleMappings = mappings;
          custom.configuredTierCapabilities = tierCapabilities;
          token.tiersFetchedAt = Date.now();
        } catch (error) {
          console.error("Failed to resolve configured Roblox group permissions", error);
          if (!mayUseCachedRoles(token.tiersFetchedAt, Date.now())) token.tiers = [];
        }
      }

      if (params.account && params.profile) {
        try {
          const userData = {
            username: token.username ?? token.providerUserId ?? "unknown",
            displayName: token.identityProvider === "roblox" ? token.username ?? token.providerUserId ?? "unknown" : token.displayName ?? token.username ?? token.providerUserId ?? "unknown",
            avatarUrl: token.avatarUrl ?? null,
            tiers: (token.tiers ?? []).join(","),
          };
          if (token.identityProvider === "roblox" && token.robloxUserId) {
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

      return token;
    },
  },
});

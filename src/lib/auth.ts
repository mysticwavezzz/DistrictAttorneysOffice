import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "./prisma";
import { fetchDiscordGuildMember } from "./discord/guild";
import { fetchRobloxGroupRoles } from "./roblox/groups";
import { env } from "./env";
import { DISCORD_TIER_ROLE_MAPPINGS } from "@/config/discord-role-mappings";
import { ROBLOX_TIER_ROLE_MAPPINGS } from "@/config/roblox-role-mappings";
import { capabilityMarkersForTiers, resolveTiersFromRoleMappings, resolveTiersFromRobloxRoles } from "./permissions/resolve";
import type { PermissionTier } from "./permissions/tiers";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account }) {
      if (!account) return false;
      try {
        const providerRow = await prisma.siteConfiguration.findUnique({ where: { key: "authProvider" } });
        const defaultProvider = env.ROBLOX_CLIENT_ID && env.ROBLOX_CLIENT_SECRET ? "roblox" : "discord";
        const selectedProvider = providerRow?.value === "roblox" || providerRow?.value === "discord"
          ? providerRow.value
          : defaultProvider;
        return account.provider === selectedProvider;
      } catch (error) {
        console.error("Could not verify the configured sign-in provider", error);
        return false;
      }
    },
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);

      if (token.identityProvider === "discord" && token.discordUserId && (params.account || params.trigger === "update")) {
        try {
          const [member, roleRow, capabilityRow] = await Promise.all([
            fetchDiscordGuildMember(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID, token.discordUserId),
            prisma.siteConfiguration.findUnique({ where: { key: "discordRoleMappings" } }),
            prisma.siteConfiguration.findUnique({ where: { key: "tierCapabilities" } }),
          ]);
          const roleMappings = roleRow ? JSON.parse(roleRow.value) as typeof DISCORD_TIER_ROLE_MAPPINGS : DISCORD_TIER_ROLE_MAPPINGS;
          const tierCapabilities = capabilityRow ? JSON.parse(capabilityRow.value) as Record<string, string[]> : {};
          const tiers = member ? resolveTiersFromRoleMappings(member.roles, roleMappings) : [];
          token.tiers = [...tiers, ...capabilityMarkersForTiers(tiers, tierCapabilities)] as PermissionTier[];
          const custom = token as typeof token & { configuredRoleMappings?: typeof roleMappings; configuredTierCapabilities?: typeof tierCapabilities };
          custom.configuredRoleMappings = roleMappings;
          custom.configuredTierCapabilities = tierCapabilities;
          token.tiersFetchedAt = Date.now();
        } catch (error) {
          console.error("Failed to resolve configurable permission settings", error);
        }
      } else if (token.identityProvider === "roblox" && token.robloxUserId && (params.account || params.trigger === "update")) {
        try {
          const [roles, mappingRow, capabilityRow] = await Promise.all([
            fetchRobloxGroupRoles(token.robloxUserId),
            prisma.siteConfiguration.findUnique({ where: { key: "robloxTierRoleMappings" } }),
            prisma.siteConfiguration.findUnique({ where: { key: "tierCapabilities" } }),
          ]);
          const mappings = mappingRow ? JSON.parse(mappingRow.value) as typeof ROBLOX_TIER_ROLE_MAPPINGS : ROBLOX_TIER_ROLE_MAPPINGS;
          const tierCapabilities = capabilityRow ? JSON.parse(capabilityRow.value) as Record<string, string[]> : {};
          const tiers = resolveTiersFromRobloxRoles(roles, mappings);
          token.tiers = [...tiers, ...capabilityMarkersForTiers(tiers, tierCapabilities)] as PermissionTier[];
          const custom = token as typeof token & { configuredRobloxRoleMappings?: typeof mappings; configuredTierCapabilities?: typeof tierCapabilities };
          custom.configuredRobloxRoleMappings = mappings;
          custom.configuredTierCapabilities = tierCapabilities;
          token.tiersFetchedAt = Date.now();
        } catch (error) {
          console.error("Failed to resolve configured Roblox group permissions", error);
          token.tiers = [];
        }
      }

      if (params.account && params.profile) {
        try {
          const userData = {
            username: token.username ?? token.providerUserId ?? "unknown",
            displayName: token.displayName ?? token.username ?? token.providerUserId ?? "unknown",
            avatarUrl: token.avatarUrl ?? null,
            tiers: (token.tiers ?? []).join(","),
          };
          if (token.identityProvider === "roblox" && token.robloxUserId) {
            await prisma.user.upsert({
              where: { robloxUserId: token.robloxUserId },
              update: userData,
              create: { ...userData, robloxUserId: token.robloxUserId },
            });
          } else if (token.discordUserId) {
            await prisma.user.upsert({
              where: { discordUserId: token.discordUserId },
              update: userData,
              create: { ...userData, discordUserId: token.discordUserId },
            });
          }
        } catch (error) {
          console.error("Failed to upsert local user record", error);
        }
      } else if (params.trigger === "update" && token.identityProvider === "roblox" && token.robloxUserId) {
        try {
          await prisma.user.updateMany({
            where: { robloxUserId: token.robloxUserId },
            data: { displayName: token.displayName ?? token.username ?? token.robloxUserId, username: token.username ?? token.robloxUserId, tiers: (token.tiers ?? []).join(",") },
          });
        } catch (error) {
          console.error("Failed to sync local Roblox user record", error);
        }
      } else if (token.discordUserId && params.trigger === "update") {
        try {
          await prisma.user.updateMany({
            where: { discordUserId: token.discordUserId },
            data: {
              displayName: token.displayName ?? token.discordUserId,
              tiers: (token.tiers ?? []).join(","),
            },
          });
        } catch (error) {
          console.error("Failed to sync local user record", error);
        }
      }

      return token;
    },
  },
});

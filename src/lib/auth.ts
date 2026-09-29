import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "./prisma";
import type { DiscordProfile } from "next-auth/providers/discord";
import { fetchDiscordGuildMember } from "./discord/guild";
import { env } from "./env";
import { DISCORD_TIER_ROLE_MAPPINGS } from "@/config/discord-role-mappings";
import { capabilityMarkersForTiers, resolveTiersFromRoleMappings } from "./permissions/resolve";
import type { PermissionTier } from "./permissions/tiers";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);

      if (token.discordUserId && (params.account || params.trigger === "update")) {
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
      }

      if (params.account && params.profile) {
        const discordProfile = params.profile as DiscordProfile;
        try {
          await prisma.user.upsert({
            where: { discordUserId: discordProfile.id },
            update: {
              username: token.username ?? discordProfile.id,
              displayName: token.displayName ?? discordProfile.id,
              avatarUrl: token.avatarUrl ?? null,
              tiers: (token.tiers ?? []).join(","),
            },
            create: {
              discordUserId: discordProfile.id,
              username: token.username ?? discordProfile.id,
              displayName: token.displayName ?? discordProfile.id,
              avatarUrl: token.avatarUrl ?? null,
              tiers: (token.tiers ?? []).join(","),
            },
          });
        } catch (error) {
          console.error("Failed to upsert local user record", error);
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

import type { NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";
import type { DiscordProfile } from "next-auth/providers/discord";
import RobloxProvider, { type RobloxOAuthProfile } from "./roblox/provider";
import { fetchDiscordGuildMember, discordAvatarUrl } from "./discord/guild";
import { fetchRobloxGroupRoles } from "./roblox/groups";
import { resolveTiersFromDiscordRoles, resolveTiersFromRobloxRoles, capabilityMarkersForTiers } from "./permissions/resolve";
import { ROBLOX_TIER_ROLE_MAPPINGS, type RobloxTierRoleMapping } from "@/config/roblox-role-mappings";
import { env } from "./env";

// Resolve Discord membership on each authenticated request so a page refresh
// reflects removed roles immediately instead of keeping revoked access cached.
const ROLE_REFRESH_INTERVAL_MS = 0;

export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  secret: env.AUTH_SECRET,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    ...(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET ? [Discord({
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      authorization: "https://discord.com/api/oauth2/authorize?scope=identify",
    })] : []),
    ...(env.ROBLOX_CLIENT_ID && env.ROBLOX_CLIENT_SECRET ? [RobloxProvider({
      clientId: env.ROBLOX_CLIENT_ID,
      clientSecret: env.ROBLOX_CLIENT_SECRET,
    })] : []),
  ],
  callbacks: {
    async jwt({ token, account, profile, trigger }) {
      if (account?.provider === "discord" && profile) {
        const discordProfile = profile as DiscordProfile;
        token.identityProvider = "discord";
        token.providerUserId = discordProfile.id;
        token.discordUserId = discordProfile.id;
        token.username = discordProfile.global_name ?? discordProfile.username;
        token.avatarUrl = discordAvatarUrl(discordProfile);
      } else if (account?.provider === "roblox" && profile) {
        const robloxProfile = profile as RobloxOAuthProfile;
        const robloxUserId = String(robloxProfile.sub);
        token.identityProvider = "roblox";
        token.providerUserId = robloxUserId;
        token.robloxUserId = robloxUserId;
        token.username = robloxProfile.preferred_username ?? robloxProfile.nickname ?? robloxProfile.name ?? robloxUserId;
        token.displayName = robloxProfile.name ?? robloxProfile.nickname ?? token.username;
        token.avatarUrl = robloxProfile.picture ?? null;
      }

      const now = Date.now();
      const isStale =
        !token.tiersFetchedAt || now - token.tiersFetchedAt > ROLE_REFRESH_INTERVAL_MS;
      const forced = trigger === "update";

      if (token.identityProvider === "discord" && token.discordUserId && (isStale || forced || (account && profile))) {
        try {
          const member = await fetchDiscordGuildMember(
            env.DISCORD_BOT_TOKEN,
            env.DISCORD_GUILD_ID,
            token.discordUserId
          );
          token.displayName = member?.nick ?? token.username ?? token.discordUserId;
          const custom = token as typeof token & {
            configuredRoleMappings?: { tier: import("./permissions/tiers").PermissionTier; roleIds: string[] }[];
            configuredTierCapabilities?: Record<string, string[]>;
          };
          const resolved = member
            ? custom.configuredRoleMappings
              ? (await import("./permissions/resolve")).resolveTiersFromRoleMappings(member.roles, custom.configuredRoleMappings)
              : resolveTiersFromDiscordRoles(member.roles)
            : [];
          const markers = (await import("./permissions/resolve")).capabilityMarkersForTiers(
            resolved,
            custom.configuredTierCapabilities ?? {}
          );
          token.tiers = [...resolved, ...markers] as typeof token.tiers;
          token.tiersFetchedAt = now;
        } catch (error) {
          console.error("Failed to resolve Discord permission tiers", error);
          token.tiers = token.tiers ?? [];
          token.displayName = token.displayName ?? token.username;
        }
      } else if (token.identityProvider === "roblox" && token.robloxUserId && (isStale || forced || (account && profile))) {
        try {
          const roles = await fetchRobloxGroupRoles(token.robloxUserId);
          const custom = token as typeof token & {
            configuredRobloxRoleMappings?: RobloxTierRoleMapping[];
            configuredTierCapabilities?: Record<string, string[]>;
          };
          const resolved = resolveTiersFromRobloxRoles(roles, custom.configuredRobloxRoleMappings ?? ROBLOX_TIER_ROLE_MAPPINGS);
          token.tiers = [...resolved, ...capabilityMarkersForTiers(resolved, custom.configuredTierCapabilities ?? {})] as typeof token.tiers;
          token.tiersFetchedAt = now;
        } catch (error) {
          console.error("Failed to resolve Roblox group permissions", error);
          token.tiers = [];
          token.tiersFetchedAt = now;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.identityProvider = token.identityProvider ?? "discord";
      session.user.providerUserId = token.providerUserId ?? token.discordUserId ?? "";
      session.user.discordUserId = token.discordUserId ?? "";
      session.user.robloxUserId = token.robloxUserId ?? "";
      session.user.username = token.username ?? "";
      session.user.displayName = token.displayName ?? token.username ?? "";
      session.user.avatarUrl = token.avatarUrl ?? null;
      session.user.tiers = token.tiers ?? [];
      return session;
    },
  },
} satisfies NextAuthConfig;

import type { NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";
import type { DiscordProfile } from "next-auth/providers/discord";
import { fetchDiscordGuildMember, discordAvatarUrl } from "./discord/guild";
import { resolveTiersFromDiscordRoles } from "./permissions/resolve";
import { env } from "./env";

const ROLE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  secret: env.AUTH_SECRET,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Discord({
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      authorization: "https://discord.com/api/oauth2/authorize?scope=identify",
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile, trigger }) {
      if (account && profile) {
        const discordProfile = profile as DiscordProfile;
        token.discordUserId = discordProfile.id;
        token.username = discordProfile.global_name ?? discordProfile.username;
        token.avatarUrl = discordAvatarUrl(discordProfile);
      }

      const now = Date.now();
      const isStale =
        !token.tiersFetchedAt || now - token.tiersFetchedAt > ROLE_REFRESH_INTERVAL_MS;
      const forced = trigger === "update";

      if (token.discordUserId && (isStale || forced || (account && profile))) {
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
      }

      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.discordUserId = token.discordUserId ?? "";
      session.user.username = token.username ?? "";
      session.user.displayName = token.displayName ?? token.username ?? "";
      session.user.avatarUrl = token.avatarUrl ?? null;
      session.user.tiers = token.tiers ?? [];
      return session;
    },
  },
} satisfies NextAuthConfig;

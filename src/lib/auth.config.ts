import type { NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";
import type { DiscordProfile } from "next-auth/providers/discord";
import { fetchDiscordGuildMember, discordAvatarUrl } from "./discord/guild";
import { resolveTiersFromDiscordRoles } from "./permissions/resolve";
import { env } from "./env";

const ROLE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

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
          const configuredCapabilities = new Set<string>();
          const deniedCapabilities = new Set<string>();
          for (const tier of resolved) {
            const grants = custom.configuredTierCapabilities?.[tier];
            if (!grants) continue;
            const defaults = (await import("./permissions/tiers")).TIER_DEFINITIONS[tier].capabilities as string[];
            for (const capability of defaults) if (!grants.includes(capability)) deniedCapabilities.add(capability);
            for (const capability of grants) if (!defaults.includes(capability)) configuredCapabilities.add(capability);
          }
          token.tiers = [
            ...resolved,
            ...Array.from(configuredCapabilities, (value) => `cap:${value}`),
            ...Array.from(deniedCapabilities, (value) => `denycap:${value}`),
          ] as typeof token.tiers;
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

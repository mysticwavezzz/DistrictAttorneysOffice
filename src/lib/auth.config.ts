import type { NextAuthConfig } from "next-auth";
import RobloxProvider, { type RobloxOAuthProfile } from "./roblox/provider";
import { fetchRobloxGroupRoles } from "./roblox/groups";
import { resolveTiersFromRobloxRoles } from "./permissions/resolve";
import { env } from "./env";

const ROLE_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Edge-runtime-safe half of the Auth.js config: no Prisma import here.
 * `middleware.ts` builds its own lightweight `auth()` from this file so
 * route-protection checks never try to bundle the (Node-only) Prisma
 * client into the Edge middleware bundle. `auth.ts` re-uses this same
 * config and layers the database-backed bits (user upsert) on top for
 * use in server components / route handlers, which run on Node.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  secret: env.AUTH_SECRET,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    RobloxProvider({
      clientId: env.ROBLOX_CLIENT_ID,
      clientSecret: env.ROBLOX_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const robloxProfile = profile as RobloxOAuthProfile;
        token.robloxUserId = robloxProfile.sub;
        token.username =
          robloxProfile.preferred_username ?? robloxProfile.nickname ?? robloxProfile.sub;
        token.displayName = robloxProfile.name ?? token.username;
        token.avatarUrl = robloxProfile.picture ?? null;
      }

      const now = Date.now();
      const isStale =
        !token.tiersFetchedAt || now - token.tiersFetchedAt > ROLE_REFRESH_INTERVAL_MS;

      if (token.robloxUserId && (isStale || (account && profile))) {
        try {
          const roles = await fetchRobloxGroupRoles(token.robloxUserId);
          token.tiers = resolveTiersFromRobloxRoles(roles);
          token.tiersFetchedAt = now;
        } catch (error) {
          console.error("Failed to resolve Roblox permission tiers", error);
          // Keep whatever tiers we already had rather than de-authorizing
          // a signed-in user because of a transient Roblox API outage.
          token.tiers = token.tiers ?? [];
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.robloxUserId = token.robloxUserId ?? "";
      session.user.username = token.username ?? "";
      session.user.displayName = token.displayName ?? "";
      session.user.avatarUrl = token.avatarUrl ?? null;
      session.user.tiers = token.tiers ?? [];
      return session;
    },
  },
} satisfies NextAuthConfig;

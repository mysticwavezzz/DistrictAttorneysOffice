import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "./prisma";
import type { RobloxOAuthProfile } from "./roblox/provider";

/**
 * Full, Node-runtime Auth.js instance used by the `/api/auth/*` route
 * handlers and by server components/actions that call `auth()`. Layers a
 * local-user upsert on top of the shared edge-safe config so every
 * successful Roblox sign-in has a durable `User` row to hang
 * `Case.assignedAttorneyId` / `Case.createdById` off of later.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);

      if (params.account && params.profile) {
        const robloxProfile = params.profile as RobloxOAuthProfile;
        try {
          await prisma.user.upsert({
            where: { robloxUserId: robloxProfile.sub },
            update: {
              username: token.username ?? robloxProfile.sub,
              displayName: token.displayName ?? robloxProfile.sub,
              avatarUrl: token.avatarUrl ?? null,
            },
            create: {
              robloxUserId: robloxProfile.sub,
              username: token.username ?? robloxProfile.sub,
              displayName: token.displayName ?? robloxProfile.sub,
              avatarUrl: token.avatarUrl ?? null,
            },
          });
        } catch (error) {
          console.error("Failed to upsert local user record", error);
        }
      }

      return token;
    },
  },
});

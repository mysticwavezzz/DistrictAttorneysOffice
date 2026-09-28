import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "./prisma";
import type { RobloxOAuthProfile } from "./roblox/provider";

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

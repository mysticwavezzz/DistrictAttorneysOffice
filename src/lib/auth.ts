import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "./prisma";
import type { DiscordProfile } from "next-auth/providers/discord";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);

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

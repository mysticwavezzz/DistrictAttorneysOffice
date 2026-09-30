import type { DefaultSession } from "next-auth";
import type { PermissionTier } from "@/lib/permissions/tiers";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      identityProvider: "discord" | "roblox";
      providerUserId: string;
      discordUserId: string;
      robloxUserId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      tiers: PermissionTier[];
    } & DefaultSession["user"];
  }
}

// Augment @auth/core/jwt directly. Augmenting "next-auth/jwt" does not merge because it re-exports via `export *`.
declare module "@auth/core/jwt" {
  interface JWT {
    identityProvider?: "discord" | "roblox";
    providerUserId?: string;
    discordUserId?: string;
    robloxUserId?: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string | null;
    tiers?: PermissionTier[];
    tiersFetchedAt?: number;
  }
}

import type { DefaultSession } from "next-auth";
import type { PermissionTier } from "@/lib/permissions/tiers";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      discordUserId: string;
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
    discordUserId?: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string | null;
    tiers?: PermissionTier[];
    tiersFetchedAt?: number;
  }
}

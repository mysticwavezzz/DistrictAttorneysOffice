import type { DefaultSession } from "next-auth";
import type { PermissionTier } from "@/lib/permissions/tiers";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      robloxUserId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      tiers: PermissionTier[];
    } & DefaultSession["user"];
  }
}

// `next-auth/jwt.d.ts` re-exports JWT via `export * from "@auth/core/jwt"`,
// and TypeScript's declaration-merging for module augmentation doesn't
// follow a wildcard re-export — augmenting "next-auth/jwt" silently
// creates an unrelated shadow interface instead of merging. The actual
// `JWT` type used inside Auth.js's callback signatures is imported from
// "@auth/core/jwt" directly, so that's what has to be augmented.
declare module "@auth/core/jwt" {
  interface JWT {
    robloxUserId?: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string | null;
    tiers?: PermissionTier[];
    tiersFetchedAt?: number;
  }
}

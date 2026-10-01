import { DEVELOPER_PROFILE_TIER, type PermissionTier } from "@/lib/permissions/tiers";

// Authenticated Roblox usernames only; this is never read from user input.
export const DEVELOPER_PROFILE_USERNAMES = ["M_ysticWavezzz"] as const;

export function isDeveloperProfileIdentity(provider: string | undefined, authenticatedUsername: string | undefined): boolean {
  if (provider !== "roblox" || !authenticatedUsername) return false;
  const normalized = authenticatedUsername.trim().toLocaleLowerCase("en-US");
  return DEVELOPER_PROFILE_USERNAMES.some((username) => username.toLocaleLowerCase("en-US") === normalized);
}

export function developerProfileSettingKey(robloxUserId: string): string {
  return `developerProfileEnabled:${robloxUserId}`;
}

export function withDeveloperProfile(
  provider: string | undefined,
  authenticatedUsername: string | undefined,
  tiers: PermissionTier[],
  enabled: boolean
): PermissionTier[] {
  const baseTiers = tiers.filter((tier) => tier !== DEVELOPER_PROFILE_TIER);
  if (!enabled || !isDeveloperProfileIdentity(provider, authenticatedUsername)) return baseTiers;
  return [...baseTiers, DEVELOPER_PROFILE_TIER];
}

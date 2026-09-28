import { PERMISSION_TIERS, type PermissionTier } from "@/lib/permissions/tiers";

export interface DiscordTierMapping {
  tier: PermissionTier;
  roleIds: string[];
}

export const DISCORD_TIER_ROLE_MAPPINGS: DiscordTierMapping[] = [
  { tier: PERMISSION_TIERS.LAW_ENFORCEMENT, roleIds: [] },
  { tier: PERMISSION_TIERS.GOVERNMENT, roleIds: [] },
  { tier: PERMISSION_TIERS.DA_PARALEGAL, roleIds: [] },
  { tier: PERMISSION_TIERS.DA_ATTORNEY, roleIds: [] },
  { tier: PERMISSION_TIERS.DISTRICT_ATTORNEY, roleIds: [] },
];

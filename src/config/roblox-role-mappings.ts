import { PERMISSION_TIERS } from "@/lib/permissions/tiers";

export const ROBLOX_DA_GROUP_ID = 32985413;

export interface RobloxTierRoleMapping {
  tier: (typeof PERMISSION_TIERS)[keyof typeof PERMISSION_TIERS];
  groupId: number;
  roleIds: number[];
}

// Role IDs are from the public Roblox group roles endpoint. General and
// provisional roles intentionally receive no staff permissions.
export const ROBLOX_TIER_ROLE_MAPPINGS: RobloxTierRoleMapping[] = [
  { tier: PERMISSION_TIERS.DA_PARALEGAL, groupId: ROBLOX_DA_GROUP_ID, roleIds: [788313093, 787584103, 100910635] },
  { tier: PERMISSION_TIERS.SPECIAL_INVESTIGATIONS, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100910644] },
  { tier: PERMISSION_TIERS.DA_ATTORNEY, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100910625, 100910612] },
  { tier: PERMISSION_TIERS.SUPERVISING_ADA, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100910606, 100910597] },
  { tier: PERMISSION_TIERS.DISTRICT_ATTORNEY, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100901327] },
];

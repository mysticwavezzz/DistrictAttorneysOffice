import { PERMISSION_TIERS } from "@/lib/permissions/tiers";

export const ROBLOX_DA_GROUP_ID = 32985413;
export const ROBLOX_LESTA_GROUP_ID = 32305935;
export const ROBLOX_LAW_ENFORCEMENT_AGENCY_GROUP_IDS = [
  1071727956, // Kaslo Township Police Department
  970861819, // Harrison County Military Law Enforcement
  35056569, // Harrison County Transportation Police
  32305984, // Jamestown Police Department
  32985202, // Harrison County Sheriff's Office
] as const;

export interface RobloxTierRoleMapping {
  tier: (typeof PERMISSION_TIERS)[keyof typeof PERMISSION_TIERS];
  groupId: number;
  roleIds: number[];
  /** Match any Roblox role in this group instead of enumerating role IDs. */
  allRoles?: boolean;
  /** Every listed group must also be present for this mapping to grant its tier. */
  requiredGroupIds?: number[];
}

// Role IDs are from the public Roblox group roles endpoint. General and
// provisional roles intentionally receive no staff permissions.
export const ROBLOX_TIER_ROLE_MAPPINGS: RobloxTierRoleMapping[] = [
  { tier: PERMISSION_TIERS.ROBLOX_GUEST, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100901328] },
  { tier: PERMISSION_TIERS.ROBLOX_MEMBER, groupId: ROBLOX_DA_GROUP_ID, roleIds: [12884901889] },
  { tier: PERMISSION_TIERS.NON_ATTORNEY_PERSONNEL, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100910645] },
  { tier: PERMISSION_TIERS.PROVISIONAL_STAFFER, groupId: ROBLOX_DA_GROUP_ID, roleIds: [788467063] },
  { tier: PERMISSION_TIERS.SECRETARY, groupId: ROBLOX_DA_GROUP_ID, roleIds: [788313093] },
  { tier: PERMISSION_TIERS.SECRETARY_SUPERVISOR, groupId: ROBLOX_DA_GROUP_ID, roleIds: [787584103] },
  { tier: PERMISSION_TIERS.SPECIAL_INVESTIGATOR, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100910644] },
  { tier: PERMISSION_TIERS.EXECUTIVE_SECRETARY, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100910635] },
  { tier: PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100910625] },
  { tier: PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100910612] },
  { tier: PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100910606] },
  { tier: PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100910597] },
  { tier: PERMISSION_TIERS.DISTRICT_ATTORNEY, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100901327] },
  { tier: PERMISSION_TIERS.ROBLOX_UTILITY, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100901326] },
  { tier: PERMISSION_TIERS.ROBLOX_NATIONAL, groupId: ROBLOX_DA_GROUP_ID, roleIds: [100901325] },
  ...ROBLOX_LAW_ENFORCEMENT_AGENCY_GROUP_IDS.map((groupId) => ({
    tier: PERMISSION_TIERS.LAW_ENFORCEMENT,
    groupId,
    roleIds: [],
    allRoles: true,
    requiredGroupIds: [ROBLOX_LESTA_GROUP_ID],
  })),
];

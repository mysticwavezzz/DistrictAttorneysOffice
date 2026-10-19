import { PERMISSION_TIERS, DEVELOPER_PROFILE_TIER, type PermissionTier } from "@/lib/permissions/tiers";

const RANK_TIERS: Record<string, PermissionTier> = {
  "District Attorney": PERMISSION_TIERS.DISTRICT_ATTORNEY,
  "Deputy District Attorney": PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY,
  "Chief Assistant District Attorney": PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY,
  "Senior Assistant District Attorney": PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY,
  "Executive Secretary": PERMISSION_TIERS.EXECUTIVE_SECRETARY,
  "Assistant District Attorney": PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY,
  "Secretary Supervisor": PERMISSION_TIERS.SECRETARY_SUPERVISOR,
  "Secretary": PERMISSION_TIERS.SECRETARY,
  "Paralegal": PERMISSION_TIERS.DA_PARALEGAL,
  "Special Investigator": PERMISSION_TIERS.SPECIAL_INVESTIGATOR,
  "Chief of Staff": PERMISSION_TIERS.NON_ATTORNEY_PERSONNEL,
  "Prosecutor in Training": PERMISSION_TIERS.PROVISIONAL_STAFFER,
  "Paralegal in Training": PERMISSION_TIERS.PROVISIONAL_STAFFER,
};

const GROUP_RANK_TIERS = new Set<PermissionTier>([
  PERMISSION_TIERS.DISTRICT_ATTORNEY,
  PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.EXECUTIVE_SECRETARY,
  PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.DA_ATTORNEY,
  PERMISSION_TIERS.DA_PARALEGAL,
  PERMISSION_TIERS.SECRETARY_SUPERVISOR,
  PERMISSION_TIERS.SECRETARY,
  PERMISSION_TIERS.SPECIAL_INVESTIGATOR,
  PERMISSION_TIERS.NON_ATTORNEY_PERSONNEL,
  PERMISSION_TIERS.PROVISIONAL_STAFFER,
  PERMISSION_TIERS.ROBLOX_GUEST,
  PERMISSION_TIERS.ROBLOX_MEMBER,
  PERMISSION_TIERS.ROBLOX_UTILITY,
  PERMISSION_TIERS.ROBLOX_NATIONAL,
]);

export function tierForRosterRank(rank: string): PermissionTier | null {
  return RANK_TIERS[rank] ?? null;
}

export function applyRosterRankOverride(tiers: PermissionTier[], rankOverride: string | null): PermissionTier[] {
  if (!rankOverride) return tiers;
  const tier = tierForRosterRank(rankOverride);
  if (!tier) return tiers;
  return replaceGroupRankTier(tiers, rankOverride);
}

export function replaceGroupRankTier(tiers: PermissionTier[], rank: string | null): PermissionTier[] {
  const tier = rank ? tierForRosterRank(rank) : null;
  return [...new Set([...tiers.filter((value) => !GROUP_RANK_TIERS.has(value)), ...(tier ? [tier] : [])])];
}

function authorityLevel(tiers: PermissionTier[]): number {
  if (tiers.includes(DEVELOPER_PROFILE_TIER) || tiers.includes(PERMISSION_TIERS.DISTRICT_ATTORNEY)) return 3;
  if (tiers.includes(PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY)) return 2;
  if (tiers.includes(PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY)) return 1;
  return 0;
}

function rankLevel(rank: string | null): number {
  if (rank === "District Attorney") return 3;
  if (rank === "Deputy District Attorney") return 2;
  if (rank === "Chief Assistant District Attorney" || rank === "Executive Secretary") return 1;
  return 0;
}

export function canControlStaff(
  actorTiers: PermissionTier[],
  actorRobloxId: string,
  actorDivision: string | null,
  target: { robloxUserId: string | null; unit: string | null; rank: string | null },
): boolean {
  const level = authorityLevel(actorTiers);
  if (!level || (target.robloxUserId && target.robloxUserId === actorRobloxId)) return false;
  if (level === 1 && (!actorDivision || target.unit !== actorDivision)) return false;
  return rankLevel(target.rank) < level;
}

export function canAssignStaffRank(actorTiers: PermissionTier[], rank: string): boolean {
  const level = authorityLevel(actorTiers);
  return level > 0 && Boolean(tierForRosterRank(rank)) && rankLevel(rank) < level;
}

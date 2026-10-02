import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { DEVELOPER_PROFILE_TIER, PERMISSION_TIERS, type PermissionTier } from "@/lib/permissions/tiers";

export function parseStoredTiers(value: string): PermissionTier[] {
  return value.split(",").filter((tier): tier is PermissionTier => tier === DEVELOPER_PROFILE_TIER || Object.values(PERMISSION_TIERS).includes(tier as (typeof PERMISSION_TIERS)[keyof typeof PERMISSION_TIERS]));
}

export function canViewAllContactMail(tiers: PermissionTier[]): boolean {
  return [PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY, PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY, PERMISSION_TIERS.DISTRICT_ATTORNEY, DEVELOPER_PROFILE_TIER].some((tier) => tiers.includes(tier));
}

export function canRouteContactMail(tiers: PermissionTier[]): boolean {
  return hasCapability(tiers, CAPABILITIES.CASES_APPROVE_DIVISION) || hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS);
}

export function canViewContactMail(tiers: PermissionTier[], userId: string, ticket: { requesterId: string; assigneeId: string | null }): boolean {
  return canViewAllContactMail(tiers) || ticket.requesterId === userId || (ticket.assigneeId === userId && hasCapability(tiers, CAPABILITIES.CASES_VIEW));
}

const STAFF_ASSIGNABLE_TIERS: PermissionTier[] = [
  PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.DISTRICT_ATTORNEY,
  PERMISSION_TIERS.DA_PARALEGAL,
  PERMISSION_TIERS.SECRETARY,
  PERMISSION_TIERS.SECRETARY_SUPERVISOR,
  PERMISSION_TIERS.EXECUTIVE_SECRETARY,
  PERMISSION_TIERS.SPECIAL_INVESTIGATIONS,
  PERMISSION_TIERS.SPECIAL_INVESTIGATOR,
  DEVELOPER_PROFILE_TIER,
];

export function isAssignableContactEmployee(tiers: PermissionTier[]): boolean {
  return STAFF_ASSIGNABLE_TIERS.some((tier) => tiers.includes(tier));
}

const ATTORNEY_TIERS: PermissionTier[] = [
  PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.DISTRICT_ATTORNEY,
];

export function isContactAttorney(tiers: PermissionTier[]): boolean {
  return ATTORNEY_TIERS.some((tier) => tiers.includes(tier));
}

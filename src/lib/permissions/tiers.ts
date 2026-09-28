import { CAPABILITIES, type Capability } from "./capabilities";

/**
 * Every recognized permission tier. Adding a new tier is a three-step,
 * additive change: add the id here, add its definition below, and add a
 * role-matching rule in `src/config/role-mappings.ts`. No other file in
 * the auth/permission/middleware chain needs to change.
 */
export const PERMISSION_TIERS = {
  LAW_ENFORCEMENT: "law_enforcement",
  GOVERNMENT: "government",
  DA_PARALEGAL: "da_paralegal",
  DA_ATTORNEY: "da_attorney",
  DISTRICT_ATTORNEY: "district_attorney",
} as const;

export type PermissionTier = (typeof PERMISSION_TIERS)[keyof typeof PERMISSION_TIERS];

export interface TierDefinition {
  id: PermissionTier;
  label: string;
  /** Short description shown in staff-facing UI (e.g. account menu). */
  description: string;
  capabilities: Capability[];
}

export const TIER_DEFINITIONS: Record<PermissionTier, TierDefinition> = {
  [PERMISSION_TIERS.LAW_ENFORCEMENT]: {
    id: PERMISSION_TIERS.LAW_ENFORCEMENT,
    label: "Law Enforcement",
    description: "Verified member of a recognized law enforcement agency.",
    capabilities: [CAPABILITIES.STAFF_DIRECTORY_VIEW],
  },
  [PERMISSION_TIERS.GOVERNMENT]: {
    id: PERMISSION_TIERS.GOVERNMENT,
    label: "Government",
    description: "Verified member of county government.",
    capabilities: [CAPABILITIES.STAFF_DIRECTORY_VIEW],
  },
  [PERMISSION_TIERS.DA_PARALEGAL]: {
    id: PERMISSION_TIERS.DA_PARALEGAL,
    label: "Paralegal",
    description: "District Attorney's Office paralegal staff.",
    capabilities: [CAPABILITIES.DASHBOARD_VIEW, CAPABILITIES.CASES_VIEW],
  },
  [PERMISSION_TIERS.DA_ATTORNEY]: {
    id: PERMISSION_TIERS.DA_ATTORNEY,
    label: "Attorney",
    description: "District Attorney's Office prosecuting attorney.",
    capabilities: [
      CAPABILITIES.DASHBOARD_VIEW,
      CAPABILITIES.CASES_VIEW,
      CAPABILITIES.CASES_CREATE,
      CAPABILITIES.CASES_EDIT,
    ],
  },
  [PERMISSION_TIERS.DISTRICT_ATTORNEY]: {
    id: PERMISSION_TIERS.DISTRICT_ATTORNEY,
    label: "District Attorney",
    description: "Head of the District Attorney's Office.",
    capabilities: [
      CAPABILITIES.DASHBOARD_VIEW,
      CAPABILITIES.CASES_VIEW,
      CAPABILITIES.CASES_CREATE,
      CAPABILITIES.CASES_EDIT,
      CAPABILITIES.CASES_DELETE,
      CAPABILITIES.CASES_MANAGE_STAFF,
    ],
  },
};

export const ALL_TIERS = Object.values(PERMISSION_TIERS);

export function isPermissionTier(value: string): value is PermissionTier {
  return (ALL_TIERS as string[]).includes(value);
}

import { CAPABILITIES, type Capability } from "./capabilities";

export const PERMISSION_TIERS = {
  LAW_ENFORCEMENT: "law_enforcement",
  GOVERNMENT: "government",
  DA_PARALEGAL: "da_paralegal",
  DA_ATTORNEY: "da_attorney",
  SPECIAL_INVESTIGATIONS: "special_investigations",
  SUPERVISING_ADA: "supervising_ada",
  DISTRICT_ATTORNEY: "district_attorney",
} as const;

export type PermissionTier = (typeof PERMISSION_TIERS)[keyof typeof PERMISSION_TIERS];

export interface TierDefinition {
  id: PermissionTier;
  label: string;
  description: string;
  capabilities: Capability[];
}

export const TIER_DEFINITIONS: Record<PermissionTier, TierDefinition> = {
  [PERMISSION_TIERS.LAW_ENFORCEMENT]: {
    id: PERMISSION_TIERS.LAW_ENFORCEMENT,
    label: "Law Enforcement",
    description: "Verified member of a recognized law enforcement agency.",
    capabilities: [CAPABILITIES.BULLETIN_VIEW],
  },
  [PERMISSION_TIERS.GOVERNMENT]: {
    id: PERMISSION_TIERS.GOVERNMENT,
    label: "Government",
    description: "Verified member of county government.",
    capabilities: [CAPABILITIES.DASHBOARD_VIEW, CAPABILITIES.ROSTER_VIEW],
  },
  [PERMISSION_TIERS.DA_PARALEGAL]: {
    id: PERMISSION_TIERS.DA_PARALEGAL,
    label: "Paralegal",
    description: "District Attorney's Office paralegal staff.",
    capabilities: [
      CAPABILITIES.DASHBOARD_VIEW,
      CAPABILITIES.CASES_VIEW,
      CAPABILITIES.CASES_VIEW_ALL,
      CAPABILITIES.CASES_PROPOSE_EDIT,
      CAPABILITIES.ROSTER_VIEW,
    ],
  },
  [PERMISSION_TIERS.DA_ATTORNEY]: {
    id: PERMISSION_TIERS.DA_ATTORNEY,
    label: "Attorney",
    description: "District Attorney's Office prosecuting attorney (Assistant District Attorney).",
    capabilities: [
      CAPABILITIES.DASHBOARD_VIEW,
      CAPABILITIES.CASES_VIEW,
      CAPABILITIES.CASES_CREATE,
      CAPABILITIES.CASES_EDIT,
      CAPABILITIES.ROSTER_VIEW,
      CAPABILITIES.ANNOUNCEMENTS_MANAGE,
      CAPABILITIES.REQUESTS_VIEW,
    ],
  },
  [PERMISSION_TIERS.SPECIAL_INVESTIGATIONS]: {
    id: PERMISSION_TIERS.SPECIAL_INVESTIGATIONS,
    label: "Special Investigations Bureau",
    description: "Writes AOPCs and reviews criminal tips referred to the office.",
    capabilities: [CAPABILITIES.DASHBOARD_VIEW, CAPABILITIES.AOPC_SUBMIT],
  },
  [PERMISSION_TIERS.SUPERVISING_ADA]: {
    id: PERMISSION_TIERS.SUPERVISING_ADA,
    label: "Supervising ADA",
    description: "Supervises assistant district attorneys; oversees the full case docket.",
    capabilities: [
      CAPABILITIES.DASHBOARD_VIEW,
      CAPABILITIES.CASES_VIEW,
      CAPABILITIES.CASES_VIEW_ALL,
      CAPABILITIES.CASES_CREATE,
      CAPABILITIES.CASES_EDIT,
      CAPABILITIES.CASES_ASSIGN,
      CAPABILITIES.CASES_APPROVE_EDITS,
      CAPABILITIES.ROSTER_VIEW,
      CAPABILITIES.REQUESTS_VIEW,
      CAPABILITIES.ACTIVITY_VIEW,
      CAPABILITIES.AOPC_REVIEW,
    ],
  },
  [PERMISSION_TIERS.DISTRICT_ATTORNEY]: {
    id: PERMISSION_TIERS.DISTRICT_ATTORNEY,
    label: "District Attorney",
    description: "Head of the District Attorney's Office.",
    capabilities: [
      CAPABILITIES.DASHBOARD_VIEW,
      CAPABILITIES.CASES_VIEW,
      CAPABILITIES.CASES_VIEW_ALL,
      CAPABILITIES.CASES_CREATE,
      CAPABILITIES.CASES_EDIT,
      CAPABILITIES.CASES_DELETE,
      CAPABILITIES.CASES_ASSIGN,
      CAPABILITIES.CASES_APPROVE_EDITS,
      CAPABILITIES.ROSTER_VIEW,
      CAPABILITIES.ROSTER_MANAGE,
      CAPABILITIES.ANNOUNCEMENTS_MANAGE,
      CAPABILITIES.REQUESTS_VIEW,
      CAPABILITIES.ACTIVITY_VIEW,
      CAPABILITIES.AOPC_REVIEW,
    ],
  },
};

export const ALL_TIERS = Object.values(PERMISSION_TIERS);

export function isPermissionTier(value: string): value is PermissionTier {
  return (ALL_TIERS as string[]).includes(value);
}

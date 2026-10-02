import { CAPABILITIES, type Capability } from "./capabilities";

export const PERMISSION_TIERS = {
  LAW_ENFORCEMENT: "law_enforcement",
  GOVERNMENT: "government",
  DA_PARALEGAL: "da_paralegal",
  DA_ATTORNEY: "da_attorney",
  SPECIAL_INVESTIGATIONS: "special_investigations",
  SUPERVISING_ADA: "supervising_ada",
  ROBLOX_GUEST: "roblox_guest",
  ROBLOX_MEMBER: "roblox_member",
  NON_ATTORNEY_PERSONNEL: "non_attorney_personnel",
  PROVISIONAL_STAFFER: "provisional_staffer",
  SECRETARY: "secretary",
  SECRETARY_SUPERVISOR: "secretary_supervisor",
  SPECIAL_INVESTIGATOR: "special_investigator",
  EXECUTIVE_SECRETARY: "executive_secretary",
  ASSISTANT_DISTRICT_ATTORNEY: "assistant_district_attorney",
  SENIOR_ASSISTANT_DISTRICT_ATTORNEY: "senior_assistant_district_attorney",
  CHIEF_ASSISTANT_DISTRICT_ATTORNEY: "chief_assistant_district_attorney",
  DEPUTY_DISTRICT_ATTORNEY: "deputy_district_attorney",
  ROBLOX_UTILITY: "roblox_utility",
  ROBLOX_NATIONAL: "roblox_national",
  DISTRICT_ATTORNEY: "district_attorney",
} as const;

export const DEVELOPER_PROFILE_TIER = "developer_profile" as const;
export type PermissionTier = (typeof PERMISSION_TIERS)[keyof typeof PERMISSION_TIERS] | typeof DEVELOPER_PROFILE_TIER;

export interface TierDefinition {
  id: PermissionTier;
  label: string;
  description: string;
  capabilities: Capability[];
}

const PARALEGAL_CAPABILITIES: Capability[] = [
  CAPABILITIES.DASHBOARD_VIEW,
  CAPABILITIES.CASES_VIEW,
  CAPABILITIES.CASES_VIEW_ALL,
  CAPABILITIES.CASES_PROPOSE_EDIT,
  CAPABILITIES.ROSTER_VIEW,
];

const ALL_SITE_CAPABILITIES = Object.values(CAPABILITIES);
const ADA_CASEWORK_CAPABILITIES: Capability[] = [CAPABILITIES.DASHBOARD_VIEW, CAPABILITIES.CASES_VIEW, CAPABILITIES.CASES_CREATE, CAPABILITIES.CASES_EDIT, CAPABILITIES.CASES_PROPOSE_EDIT];
const DIVISION_SUPERVISOR_CAPABILITIES: Capability[] = [CAPABILITIES.DASHBOARD_VIEW, CAPABILITIES.CASES_VIEW, CAPABILITIES.CASES_VIEW_DIVISION, CAPABILITIES.CASES_CREATE, CAPABILITIES.CASES_EDIT_DIVISION, CAPABILITIES.CASES_ASSIGN_DIVISION, CAPABILITIES.CASES_APPROVE_DIVISION];

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
    capabilities: [...PARALEGAL_CAPABILITIES],
  },
  [PERMISSION_TIERS.DA_ATTORNEY]: {
    id: PERMISSION_TIERS.DA_ATTORNEY,
    label: "Attorney",
    description: "Regular attorney casework without office-wide management permissions.",
    capabilities: [...ADA_CASEWORK_CAPABILITIES],
  },
  [PERMISSION_TIERS.SPECIAL_INVESTIGATIONS]: {
    id: PERMISSION_TIERS.SPECIAL_INVESTIGATIONS,
    label: "Special Investigations Bureau",
    description: "Submits case openings and supporting filings for supervisory review.",
    capabilities: [CAPABILITIES.DASHBOARD_VIEW, CAPABILITIES.CASES_VIEW, CAPABILITIES.CASES_CREATE],
  },
  [PERMISSION_TIERS.SUPERVISING_ADA]: {
    id: PERMISSION_TIERS.SUPERVISING_ADA,
    label: "Supervisory Assistant District Attorney",
    description: "Division supervisor access, limited to cases in the assigned division.",
    capabilities: [...DIVISION_SUPERVISOR_CAPABILITIES],
  },
  [PERMISSION_TIERS.ROBLOX_GUEST]: {
    id: PERMISSION_TIERS.ROBLOX_GUEST, label: "Roblox Group: Guest", description: "Guest group role; no portal permissions.", capabilities: [],
  },
  [PERMISSION_TIERS.ROBLOX_MEMBER]: {
    id: PERMISSION_TIERS.ROBLOX_MEMBER, label: "Roblox Group: Member", description: "General group member; no staff portal permissions.", capabilities: [],
  },
  [PERMISSION_TIERS.NON_ATTORNEY_PERSONNEL]: {
    id: PERMISSION_TIERS.NON_ATTORNEY_PERSONNEL, label: "Non-Attorney Personnel", description: "Non-attorney group role; no portal permissions by default.", capabilities: [],
  },
  [PERMISSION_TIERS.PROVISIONAL_STAFFER]: {
    id: PERMISSION_TIERS.PROVISIONAL_STAFFER, label: "Provisional Staffer", description: "Provisional group role; no portal permissions by default.", capabilities: [],
  },
  [PERMISSION_TIERS.SECRETARY]: {
    id: PERMISSION_TIERS.SECRETARY, label: "Secretary", description: "Secretary role with the existing paralegal-level portal permissions.", capabilities: [...PARALEGAL_CAPABILITIES],
  },
  [PERMISSION_TIERS.SECRETARY_SUPERVISOR]: {
    id: PERMISSION_TIERS.SECRETARY_SUPERVISOR, label: "Secretary Supervisor", description: "Secretary supervisor role with the existing paralegal-level portal permissions.", capabilities: [...PARALEGAL_CAPABILITIES],
  },
  [PERMISSION_TIERS.SPECIAL_INVESTIGATOR]: {
    id: PERMISSION_TIERS.SPECIAL_INVESTIGATOR, label: "Special Investigator", description: "Special Investigator role with existing investigation case-submission permissions.", capabilities: [CAPABILITIES.DASHBOARD_VIEW, CAPABILITIES.CASES_VIEW, CAPABILITIES.CASES_CREATE],
  },
  [PERMISSION_TIERS.EXECUTIVE_SECRETARY]: {
    id: PERMISSION_TIERS.EXECUTIVE_SECRETARY, label: "Executive Secretary", description: "Executive Secretary role with the existing paralegal-level portal permissions.", capabilities: [...PARALEGAL_CAPABILITIES],
  },
  [PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY]: {
    id: PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY, label: "Assistant District Attorney", description: "Division attorney access for assigned casework, filings, and proposed case changes.", capabilities: [...ADA_CASEWORK_CAPABILITIES],
  },
  [PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY]: {
    id: PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY, label: "Senior Assistant District Attorney", description: "Division supervisor access for review, assignment, and casework within the assigned division.", capabilities: [...DIVISION_SUPERVISOR_CAPABILITIES],
  },
  [PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY]: {
    id: PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY, label: "Chief Assistant District Attorney", description: "Division head access to oversee the division's case docket and roster without office-wide settings access.", capabilities: [...DIVISION_SUPERVISOR_CAPABILITIES, CAPABILITIES.ROSTER_VIEW_DIVISION, CAPABILITIES.ROSTER_MANAGE_DIVISION],
  },
  [PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY]: {
    id: PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY, label: "Deputy District Attorney", description: "Deputy District Attorney with every site capability, matching the District Attorney.", capabilities: [...ALL_SITE_CAPABILITIES],
  },
  [PERMISSION_TIERS.ROBLOX_UTILITY]: {
    id: PERMISSION_TIERS.ROBLOX_UTILITY, label: "Roblox Group: Utility", description: "Utility group role; no portal permissions by default.", capabilities: [],
  },
  [PERMISSION_TIERS.ROBLOX_NATIONAL]: {
    id: PERMISSION_TIERS.ROBLOX_NATIONAL, label: "Roblox Group: National", description: "National group role; no portal permissions by default.", capabilities: [],
  },
  [PERMISSION_TIERS.DISTRICT_ATTORNEY]: {
    id: PERMISSION_TIERS.DISTRICT_ATTORNEY,
    label: "District Attorney",
    description: "Head of the District Attorney's Office.",
    capabilities: [...ALL_SITE_CAPABILITIES],
  },
  [DEVELOPER_PROFILE_TIER]: {
    id: DEVELOPER_PROFILE_TIER,
    label: "Developer Profile",
    description: "Site developer access with every defined website capability.",
    capabilities: Object.values(CAPABILITIES),
  },
};

export const ALL_TIERS = Object.values(PERMISSION_TIERS);

export function isPermissionTier(value: string): value is PermissionTier {
  return (ALL_TIERS as string[]).includes(value);
}

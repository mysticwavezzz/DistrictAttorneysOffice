import { PERMISSION_TIERS, type PermissionTier } from "@/lib/permissions/tiers";

export interface DiscordTierMapping {
  tier: PermissionTier;
  roleIds: string[];
}

export const DISCORD_TIER_ROLE_MAPPINGS: DiscordTierMapping[] = [
  {
    tier: PERMISSION_TIERS.LAW_ENFORCEMENT,
    roleIds: [
      "1554276130675105812", // law enforcement
      "1554276193044533339", // law enforcement investigations
    ],
  },
  {
    tier: PERMISSION_TIERS.GOVERNMENT,
    roleIds: [
      "1554276129580515338", // county official
    ],
  },
  {
    tier: PERMISSION_TIERS.DA_PARALEGAL,
    roleIds: [
      "1554275964039729193", // Secretary
      "1554275991365361764", // Paralegal
      "1554276005399634072", // prosecutor in training
      "1554276037465079848", // paralegal in training
    ],
  },
  {
    tier: PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY,
    roleIds: ["1554275918288261160"], // ADA
  },
  {
    tier: PERMISSION_TIERS.SPECIAL_INVESTIGATIONS,
    roleIds: [
      // Special Investigations Bureau role id goes here
    ],
  },
  {
    tier: PERMISSION_TIERS.DISTRICT_ATTORNEY,
    roleIds: [
      "1554275816827916329", // DA
      "1554275942375882892", // Chief of Staff
    ],
  },
  { tier: PERMISSION_TIERS.DA_ATTORNEY, roleIds: [] },
  { tier: PERMISSION_TIERS.ROBLOX_GUEST, roleIds: [] },
  { tier: PERMISSION_TIERS.ROBLOX_MEMBER, roleIds: [] },
  { tier: PERMISSION_TIERS.NON_ATTORNEY_PERSONNEL, roleIds: [] },
  { tier: PERMISSION_TIERS.PROVISIONAL_STAFFER, roleIds: [] },
  { tier: PERMISSION_TIERS.SECRETARY, roleIds: [] },
  { tier: PERMISSION_TIERS.SECRETARY_SUPERVISOR, roleIds: [] },
  { tier: PERMISSION_TIERS.SPECIAL_INVESTIGATOR, roleIds: [] },
  { tier: PERMISSION_TIERS.EXECUTIVE_SECRETARY, roleIds: [] },
  { tier: PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY, roleIds: [] },
  { tier: PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY, roleIds: [] },
  { tier: PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY, roleIds: ["1554275884159078532"] }, // CADA
  { tier: PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY, roleIds: ["1554275867100971098"] }, // DDA
  { tier: PERMISSION_TIERS.ROBLOX_UTILITY, roleIds: [] },
  { tier: PERMISSION_TIERS.ROBLOX_NATIONAL, roleIds: [] },
];

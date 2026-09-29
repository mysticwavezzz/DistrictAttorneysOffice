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
    tier: PERMISSION_TIERS.DA_ATTORNEY,
    roleIds: [
      "1554275918288261160", // ADA
    ],
  },
  {
    tier: PERMISSION_TIERS.SPECIAL_INVESTIGATIONS,
    roleIds: [
      // Special Investigations Bureau role id goes here
    ],
  },
  {
    tier: PERMISSION_TIERS.SUPERVISING_ADA,
    roleIds: [
      "1554309202862678037", // Supervising ADA
    ],
  },
  {
    tier: PERMISSION_TIERS.DISTRICT_ATTORNEY,
    roleIds: [
      "1554275816827916329", // DA
      "1554275867100971098", // DDA
      "1554275884159078532", // CADA
      "1554275942375882892", // Chief of Staff
    ],
  },
];

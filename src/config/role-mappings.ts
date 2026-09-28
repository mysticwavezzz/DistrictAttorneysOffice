import { PERMISSION_TIERS, type PermissionTier } from "@/lib/permissions/tiers";

export type RoleMatcher =
  | { type: "minRank"; groupId: number; minRank: number }
  | { type: "roleName"; groupId: number; roleNames: string[] };

export interface TierRoleMapping {
  tier: PermissionTier;
  matchers: RoleMatcher[];
}

function groupIdFromEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const LAW_ENFORCEMENT_GROUP_ID = groupIdFromEnv("ROBLOX_LAW_ENFORCEMENT_GROUP_ID");
const GOVERNMENT_GROUP_ID = groupIdFromEnv("ROBLOX_GOVERNMENT_GROUP_ID");
const DA_GROUP_ID = groupIdFromEnv("ROBLOX_DA_GROUP_ID");

/**
 * Data-driven mapping from Roblox group roles to internal permission tiers.
 *
 * To add or change a role's access: edit this array (and the matching
 * tier/capabilities in `src/lib/permissions/tiers.ts` if it's a brand-new
 * tier). Nothing in the OAuth callback, middleware, or page guards needs to
 * change — they all consume the resolved tier list, never Roblox group data
 * directly.
 *
 * Group IDs are supplied via env so the mapping can be reconfigured per
 * deployment (staging group vs. production group) without a code change.
 * A mapping is simply omitted if its group ID env var isn't set.
 */
export const TIER_ROLE_MAPPINGS: TierRoleMapping[] = [
  ...(LAW_ENFORCEMENT_GROUP_ID
    ? [
        {
          tier: PERMISSION_TIERS.LAW_ENFORCEMENT,
          matchers: [
            { type: "minRank" as const, groupId: LAW_ENFORCEMENT_GROUP_ID, minRank: 1 },
          ],
        },
      ]
    : []),
  ...(GOVERNMENT_GROUP_ID
    ? [
        {
          tier: PERMISSION_TIERS.GOVERNMENT,
          matchers: [{ type: "minRank" as const, groupId: GOVERNMENT_GROUP_ID, minRank: 1 }],
        },
      ]
    : []),
  ...(DA_GROUP_ID
    ? [
        {
          tier: PERMISSION_TIERS.DA_PARALEGAL,
          matchers: [
            {
              type: "roleName" as const,
              groupId: DA_GROUP_ID,
              roleNames: ["Paralegal", "Legal Assistant"],
            },
          ],
        },
        {
          tier: PERMISSION_TIERS.DA_ATTORNEY,
          matchers: [
            {
              type: "roleName" as const,
              groupId: DA_GROUP_ID,
              roleNames: ["Attorney", "Assistant District Attorney", "ADA", "Deputy District Attorney"],
            },
          ],
        },
        {
          tier: PERMISSION_TIERS.DISTRICT_ATTORNEY,
          matchers: [
            {
              type: "roleName" as const,
              groupId: DA_GROUP_ID,
              roleNames: ["District Attorney", "Chief District Attorney"],
            },
          ],
        },
      ]
    : []),
];

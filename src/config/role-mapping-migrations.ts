import { DISCORD_TIER_ROLE_MAPPINGS, type DiscordTierMapping } from "@/config/discord-role-mappings";
import { ROBLOX_TIER_ROLE_MAPPINGS, type RobloxTierRoleMapping } from "@/config/roblox-role-mappings";
import { PERMISSION_TIERS, ALL_TIERS } from "@/lib/permissions/tiers";

/** Upgrade pre-per-role saved mappings while preserving subsequent admin edits. */
export function normalizeRobloxTierRoleMappings(saved: RobloxTierRoleMapping[]): RobloxTierRoleMapping[] {
  const result = saved.map((mapping) => ({ ...mapping, roleIds: [...mapping.roleIds] }));

  for (const currentDefault of ROBLOX_TIER_ROLE_MAPPINGS) {
    const alreadyConfigured = result.some(
      (mapping) => mapping.tier === currentDefault.tier && mapping.groupId === currentDefault.groupId
    );
    if (alreadyConfigured) continue;

    const legacyIds: number[] = [];
    for (const roleId of currentDefault.roleIds) {
      let found = false;
      for (const mapping of result) {
        if (mapping.groupId === currentDefault.groupId && mapping.roleIds.includes(roleId)) {
          found = true;
          mapping.roleIds = mapping.roleIds.filter((id) => id !== roleId);
        }
      }
      // Restore no-access/general roles that were intentionally absent from old staff-only mappings.
      if (found || [100901328, 12884901889, 100910645, 788467063, 100901326, 100901325].includes(roleId)) {
        legacyIds.push(roleId);
      }
    }
    result.push({ ...currentDefault, roleIds: legacyIds });
  }

  return result;
}

/** Merge the retired Supervising ADA tier into Senior ADA without dropping saved Roblox role IDs. */
export function mergeRetiredSupervisingAdaMappings(saved: Array<{ tier: string; groupId: number; roleIds: number[] }>): RobloxTierRoleMapping[] {
  const result = saved.map((mapping) => ({ ...mapping, roleIds: [...mapping.roleIds] }));
  const retired = result.filter((mapping) => mapping.tier === "supervising_ada");
  const current = result.filter((mapping) => mapping.tier !== "supervising_ada");
  for (const old of retired) {
    for (const roleId of old.roleIds) {
      const targetTier = roleId === 100910606
        ? PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY
        : roleId === 100910597
          ? PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY
          : roleId === 100910625
            ? PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY
            : PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY;
      const target = current.find((mapping) => mapping.tier === targetTier && mapping.groupId === old.groupId);
      if (target) target.roleIds = [...new Set([...target.roleIds, roleId])];
      else current.push({ ...old, tier: targetTier, roleIds: [roleId] });
    }
  }
  return current as RobloxTierRoleMapping[];
}

export function normalizeDiscordTierRoleMappings(saved: DiscordTierMapping[]): DiscordTierMapping[] {
  const result = saved.map((mapping) => ({ ...mapping, roleIds: [...mapping.roleIds] }));
  const defaultByTier = new Map(DISCORD_TIER_ROLE_MAPPINGS.map((mapping) => [mapping.tier, mapping]));

  for (const tier of ALL_TIERS) {
    if (result.some((mapping) => mapping.tier === tier)) continue;
    const defaults = defaultByTier.get(tier);
    result.push({ tier, roleIds: defaults ? [...defaults.roleIds] : [] });
  }

  // Existing configuration grouped CADA and DDA with DA. Move them only when
  // their dedicated tier was absent, so an explicit admin edit remains intact.
  const moves = [
    { tier: PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY, roleId: "1554275918288261160" },
    { tier: PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY, roleId: "1554275884159078532" },
    { tier: PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY, roleId: "1554275867100971098" },
  ];
  for (const move of moves) {
    if (saved.some((mapping) => mapping.tier === move.tier)) continue;
    for (const mapping of result) mapping.roleIds = mapping.roleIds.filter((id) => id !== move.roleId);
    result.find((mapping) => mapping.tier === move.tier)?.roleIds.push(move.roleId);
  }

  return result;
}

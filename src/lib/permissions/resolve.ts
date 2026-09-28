import type { RobloxGroupRole } from "@/lib/roblox/types";
import { TIER_ROLE_MAPPINGS, type RoleMatcher } from "@/config/role-mappings";
import { TIER_DEFINITIONS, type PermissionTier } from "./tiers";
import type { Capability } from "./capabilities";

function matcherMatches(matcher: RoleMatcher, roles: RobloxGroupRole[]): boolean {
  return roles.some((role) => {
    if (role.groupId !== matcher.groupId) return false;
    if (matcher.type === "minRank") {
      return role.rank >= matcher.minRank;
    }
    return matcher.roleNames.some(
      (name) => name.toLowerCase() === role.roleName.toLowerCase()
    );
  });
}

/**
 * Turn a user's live Roblox group roles into the set of internal
 * permission tiers they hold. Pure function of (roles, config) — easy to
 * unit test and safe to call on every sign-in / session refresh.
 */
export function resolveTiersFromRobloxRoles(
  roles: RobloxGroupRole[]
): PermissionTier[] {
  const tiers = new Set<PermissionTier>();
  for (const mapping of TIER_ROLE_MAPPINGS) {
    if (mapping.matchers.some((matcher) => matcherMatches(matcher, roles))) {
      tiers.add(mapping.tier);
    }
  }
  return Array.from(tiers);
}

export function capabilitiesForTiers(tiers: PermissionTier[]): Set<Capability> {
  const capabilities = new Set<Capability>();
  for (const tier of tiers) {
    for (const capability of TIER_DEFINITIONS[tier].capabilities) {
      capabilities.add(capability);
    }
  }
  return capabilities;
}

export function hasCapability(
  tiers: PermissionTier[],
  capability: Capability
): boolean {
  return capabilitiesForTiers(tiers).has(capability);
}

export function hasAnyCapability(
  tiers: PermissionTier[],
  capabilities: Capability[]
): boolean {
  const granted = capabilitiesForTiers(tiers);
  return capabilities.some((capability) => granted.has(capability));
}

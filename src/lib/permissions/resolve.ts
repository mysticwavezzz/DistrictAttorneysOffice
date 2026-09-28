import type { RobloxGroupRole } from "@/lib/roblox/types";
import { TIER_ROLE_MAPPINGS, type RoleMatcher } from "@/config/role-mappings";
import { DISCORD_TIER_ROLE_MAPPINGS } from "@/config/discord-role-mappings";
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

export function resolveTiersFromDiscordRoles(roleIds: string[]): PermissionTier[] {
  const held = new Set(roleIds);
  const tiers = new Set<PermissionTier>();
  for (const mapping of DISCORD_TIER_ROLE_MAPPINGS) {
    if (mapping.roleIds.some((id) => held.has(id))) {
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

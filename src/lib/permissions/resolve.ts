import type { RobloxGroupRole } from "@/lib/roblox/types";
import { DISCORD_TIER_ROLE_MAPPINGS } from "@/config/discord-role-mappings";
import { ROBLOX_TIER_ROLE_MAPPINGS, type RobloxTierRoleMapping } from "@/config/roblox-role-mappings";
import { TIER_DEFINITIONS, type PermissionTier } from "./tiers";
import type { Capability } from "./capabilities";

export function resolveTiersFromRobloxRoles(
  roles: RobloxGroupRole[],
  mappings: RobloxTierRoleMapping[] = ROBLOX_TIER_ROLE_MAPPINGS
): PermissionTier[] {
  const tiers = new Set<PermissionTier>();
  for (const mapping of mappings) {
    if (roles.some((role) => role.groupId === mapping.groupId && mapping.roleIds.includes(role.roleId))) {
      tiers.add(mapping.tier);
    }
  }
  return Array.from(tiers);
}

export function resolveTiersFromDiscordRoles(roleIds: string[]): PermissionTier[] {
  return resolveTiersFromRoleMappings(roleIds, DISCORD_TIER_ROLE_MAPPINGS);
}

export function resolveTiersFromRoleMappings(
  roleIds: string[],
  mappings: { tier: PermissionTier; roleIds: string[] }[]
): PermissionTier[] {
  const held = new Set(roleIds);
  const tiers = new Set<PermissionTier>();
  for (const mapping of mappings) {
    if (mapping.roleIds.some((id) => held.has(id))) {
      tiers.add(mapping.tier);
    }
  }
  return Array.from(tiers);
}

export function capabilitiesForTiers(tiers: PermissionTier[]): Set<Capability> {
  const capabilities = new Set<Capability>();
  const denied = new Set<Capability>();
  for (const tier of tiers) {
    if (tier.startsWith("cap:")) {
      capabilities.add(tier.slice(4) as Capability);
      continue;
    }
    if (tier.startsWith("denycap:")) {
      denied.add(tier.slice(8) as Capability);
      continue;
    }
    for (const capability of TIER_DEFINITIONS[tier].capabilities) {
      capabilities.add(capability);
    }
  }
  for (const capability of denied) capabilities.delete(capability);
  return capabilities;
}

export function capabilityMarkersForTiers(
  tiers: PermissionTier[],
  configuredCapabilities: Record<string, string[]>
): string[] {
  const defaults = new Set<Capability>();
  const effective = new Set<Capability>();
  for (const tier of tiers) {
    const tierDefaults = TIER_DEFINITIONS[tier].capabilities;
    tierDefaults.forEach((capability) => defaults.add(capability));
    (configuredCapabilities[tier] as Capability[] | undefined ?? tierDefaults)
      .forEach((capability) => effective.add(capability));
  }
  return [
    ...Array.from(effective).filter((capability) => !defaults.has(capability)).map((capability) => `cap:${capability}`),
    ...Array.from(defaults).filter((capability) => !effective.has(capability)).map((capability) => `denycap:${capability}`),
  ];
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

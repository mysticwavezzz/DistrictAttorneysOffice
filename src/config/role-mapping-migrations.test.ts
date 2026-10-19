import { describe, expect, it } from "vitest";
import { mergeRetiredSupervisingAdaMappings, normalizeDiscordTierRoleMappings, normalizeRobloxTierRoleMappings } from "./role-mapping-migrations";
import { PERMISSION_TIERS } from "@/lib/permissions/tiers";

describe("legacy role-mapping upgrades", () => {
  it("splits CADA and DDA out of legacy Roblox supervisory tier mappings", () => {
    const migrated = mergeRetiredSupervisingAdaMappings([
      { tier: "supervising_ada", groupId: 32985413, roleIds: [100910612, 100910606, 100910597] },
    ]);
    const normalized = normalizeRobloxTierRoleMappings([
      { tier: PERMISSION_TIERS.DA_PARALEGAL, groupId: 32985413, roleIds: [788313093, 787584103, 100910635] },
      { tier: PERMISSION_TIERS.SPECIAL_INVESTIGATIONS, groupId: 32985413, roleIds: [100910644] },
      { tier: PERMISSION_TIERS.DA_ATTORNEY, groupId: 32985413, roleIds: [100910625] },
      ...migrated,
      { tier: PERMISSION_TIERS.DISTRICT_ATTORNEY, groupId: 32985413, roleIds: [100901327] },
    ]);

    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY)?.roleIds).toEqual([100910606]);
    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY)?.roleIds).toEqual([100910597]);
    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY)?.roleIds).toEqual([100910612]);
    expect(new Set(normalized.flatMap((mapping) => mapping.roleIds)).size).toBe(normalized.flatMap((mapping) => mapping.roleIds).length);
  });

  it("splits CADA and DDA from a saved Discord DA mapping and fills new tier rows", () => {
    const normalized = normalizeDiscordTierRoleMappings([
      { tier: PERMISSION_TIERS.DA_ATTORNEY, roleIds: ["1554275918288261160"] },
      { tier: PERMISSION_TIERS.DISTRICT_ATTORNEY, roleIds: ["1554275816827916329", "1554275867100971098", "1554275884159078532", "1554275942375882892"] },
    ]);

    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY)?.roleIds).toEqual(["1554275918288261160"]);
    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY)?.roleIds).toEqual(["1554275884159078532"]);
    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY)?.roleIds).toEqual(["1554275867100971098"]);
    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.DISTRICT_ATTORNEY)?.roleIds).toEqual(["1554275816827916329", "1554275942375882892"]);
  });

  it("preserves explicit newer per-role mappings on subsequent reads", () => {
    const explicit = [{ tier: PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY, groupId: 32985413, roleIds: [123456789] }];
    const normalized = normalizeRobloxTierRoleMappings(explicit);
    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY)?.roleIds).toEqual([123456789]);
    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.DISTRICT_ATTORNEY)?.roleIds).toEqual([]);
  });

  it("restores default Secretary and Executive Secretary role IDs when old saved config has no tier rows", () => {
    const normalized = normalizeRobloxTierRoleMappings([
      { tier: PERMISSION_TIERS.DISTRICT_ATTORNEY, groupId: 32985413, roleIds: [100901327] },
    ]);

    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.SECRETARY)?.roleIds).toEqual([788313093]);
    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.SECRETARY_SUPERVISOR)?.roleIds).toEqual([787584103]);
    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.EXECUTIVE_SECRETARY)?.roleIds).toEqual([100910635]);
  });

  it("respects an explicit empty Roblox role mapping", () => {
    const normalized = normalizeRobloxTierRoleMappings([
      { tier: PERMISSION_TIERS.SECRETARY, groupId: 32985413, roleIds: [] },
    ]);

    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.SECRETARY)?.roleIds).toEqual([]);
  });

  it("adds conditional agency-wide Law Enforcement defaults to existing saved settings", () => {
    const normalized = normalizeRobloxTierRoleMappings([{ tier: PERMISSION_TIERS.DISTRICT_ATTORNEY, groupId: 32985413, roleIds: [100901327] }]);
    const lawEnforcement = normalized.filter((mapping) => mapping.tier === PERMISSION_TIERS.LAW_ENFORCEMENT);
    expect(lawEnforcement).toHaveLength(5);
    expect(lawEnforcement.every((mapping) => mapping.allRoles && mapping.roleIds.length === 0 && mapping.requiredGroupIds?.includes(32305935))).toBe(true);
  });

  it("moves retired Supervising ADA role IDs into Senior ADA and removes duplicate IDs", () => {
    const migrated = mergeRetiredSupervisingAdaMappings([
      { tier: "supervising_ada", groupId: 32985413, roleIds: [100910612, 999] },
      { tier: PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY, groupId: 32985413, roleIds: [100910612] },
    ]);
    expect(migrated).toEqual([{ tier: PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY, groupId: 32985413, roleIds: [100910612, 999] }]);
  });
});

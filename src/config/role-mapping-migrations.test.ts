import { describe, expect, it } from "vitest";
import { normalizeDiscordTierRoleMappings, normalizeRobloxTierRoleMappings } from "./role-mapping-migrations";
import { PERMISSION_TIERS } from "@/lib/permissions/tiers";

describe("legacy role-mapping upgrades", () => {
  it("splits CADA and DDA out of legacy Roblox supervisory tier mappings", () => {
    const normalized = normalizeRobloxTierRoleMappings([
      { tier: PERMISSION_TIERS.DA_PARALEGAL, groupId: 32985413, roleIds: [788313093, 787584103, 100910635] },
      { tier: PERMISSION_TIERS.SPECIAL_INVESTIGATIONS, groupId: 32985413, roleIds: [100910644] },
      { tier: PERMISSION_TIERS.DA_ATTORNEY, groupId: 32985413, roleIds: [100910625, 100910612] },
      { tier: PERMISSION_TIERS.SUPERVISING_ADA, groupId: 32985413, roleIds: [100910606, 100910597] },
      { tier: PERMISSION_TIERS.DISTRICT_ATTORNEY, groupId: 32985413, roleIds: [100901327] },
    ]);

    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY)?.roleIds).toEqual([100910606]);
    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY)?.roleIds).toEqual([100910597]);
    expect(normalized.find((mapping) => mapping.tier === PERMISSION_TIERS.SUPERVISING_ADA)?.roleIds).toEqual([]);
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
});

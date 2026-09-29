import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { RobloxGroupRole } from "@/lib/roblox/types";

const LE_GROUP = 1001;
const GOV_GROUP = 2002;
const DA_GROUP = 3003;

async function freshResolveModule() {
  vi.resetModules();
  vi.stubEnv("ROBLOX_LAW_ENFORCEMENT_GROUP_ID", String(LE_GROUP));
  vi.stubEnv("ROBLOX_GOVERNMENT_GROUP_ID", String(GOV_GROUP));
  vi.stubEnv("ROBLOX_DA_GROUP_ID", String(DA_GROUP));
  const resolve = await import("./resolve");
  const tiers = await import("./tiers");
  const capabilities = await import("./capabilities");
  return { ...resolve, ...tiers, ...capabilities };
}

describe("resolveTiersFromRobloxRoles", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("grants LAW_ENFORCEMENT for any rank >= 1 in the configured LE group", async () => {
    const { resolveTiersFromRobloxRoles, PERMISSION_TIERS } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      { groupId: LE_GROUP, groupName: "Sheriff's Office", roleName: "Deputy", rank: 5 },
    ];
    expect(resolveTiersFromRobloxRoles(roles)).toEqual([PERMISSION_TIERS.LAW_ENFORCEMENT]);
  });

  it("does not grant a tier for rank 0 (not actually in the group)", async () => {
    const { resolveTiersFromRobloxRoles } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      { groupId: LE_GROUP, groupName: "Sheriff's Office", roleName: "Guest", rank: 0 },
    ];
    expect(resolveTiersFromRobloxRoles(roles)).toEqual([]);
  });

  it("matches DA tiers by exact role name, case-insensitively", async () => {
    const { resolveTiersFromRobloxRoles, PERMISSION_TIERS } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      { groupId: DA_GROUP, groupName: "DA's Office", roleName: "district attorney", rank: 100 },
    ];
    expect(resolveTiersFromRobloxRoles(roles)).toEqual([PERMISSION_TIERS.DISTRICT_ATTORNEY]);
  });

  it("does not cross-match a DA role name against a different group", async () => {
    const { resolveTiersFromRobloxRoles, PERMISSION_TIERS } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      // Same role name as a DA tier, but in the LE group rather than the DA
      // group — it should still grant LAW_ENFORCEMENT (LE tier matches by
      // rank, not name), but never a DA tier, since those are matched by
      // (group, role name) and this role isn't in the DA group.
      { groupId: LE_GROUP, groupName: "Sheriff's Office", roleName: "Attorney", rank: 50 },
    ];
    const tiers = resolveTiersFromRobloxRoles(roles);
    expect(tiers).toEqual([PERMISSION_TIERS.LAW_ENFORCEMENT]);
    expect(tiers).not.toContain(PERMISSION_TIERS.DA_ATTORNEY);
  });

  it("grants multiple tiers when a user holds multiple qualifying roles", async () => {
    const { resolveTiersFromRobloxRoles, PERMISSION_TIERS } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      { groupId: LE_GROUP, groupName: "Sheriff's Office", roleName: "Deputy", rank: 5 },
      { groupId: DA_GROUP, groupName: "DA's Office", roleName: "Paralegal", rank: 20 },
    ];
    const tiers = resolveTiersFromRobloxRoles(roles);
    expect(tiers).toContain(PERMISSION_TIERS.LAW_ENFORCEMENT);
    expect(tiers).toContain(PERMISSION_TIERS.DA_PARALEGAL);
    expect(tiers).toHaveLength(2);
  });

  it("omits a tier entirely when its group id env var isn't configured", async () => {
    vi.resetModules();
    vi.stubEnv("ROBLOX_LAW_ENFORCEMENT_GROUP_ID", "");
    vi.stubEnv("ROBLOX_GOVERNMENT_GROUP_ID", String(GOV_GROUP));
    vi.stubEnv("ROBLOX_DA_GROUP_ID", "");
    const { resolveTiersFromRobloxRoles } = await import("./resolve");
    const roles: RobloxGroupRole[] = [
      { groupId: LE_GROUP, groupName: "Sheriff's Office", roleName: "Deputy", rank: 5 },
    ];
    expect(resolveTiersFromRobloxRoles(roles)).toEqual([]);
  });
});

describe("resolveTiersFromDiscordRoles", () => {
  afterEach(() => {
    vi.doUnmock("@/config/discord-role-mappings");
    vi.resetModules();
  });

  it("grants a tier when the member holds one of its mapped role ids", async () => {
    vi.resetModules();
    vi.doMock("@/config/discord-role-mappings", () => ({
      DISCORD_TIER_ROLE_MAPPINGS: [
        { tier: "district_attorney", roleIds: ["111"] },
        { tier: "da_attorney", roleIds: ["222", "333"] },
      ],
    }));
    const { resolveTiersFromDiscordRoles } = await import("./resolve");
    expect(resolveTiersFromDiscordRoles(["999", "222"])).toEqual(["da_attorney"]);
  });

  it("grants multiple tiers when multiple mapped roles are held", async () => {
    vi.resetModules();
    vi.doMock("@/config/discord-role-mappings", () => ({
      DISCORD_TIER_ROLE_MAPPINGS: [
        { tier: "law_enforcement", roleIds: ["111"] },
        { tier: "da_paralegal", roleIds: ["222"] },
      ],
    }));
    const { resolveTiersFromDiscordRoles } = await import("./resolve");
    const tiers = resolveTiersFromDiscordRoles(["111", "222"]);
    expect(tiers).toContain("law_enforcement");
    expect(tiers).toContain("da_paralegal");
    expect(tiers).toHaveLength(2);
  });

  it("returns no tiers when none of the held roles are mapped", async () => {
    vi.resetModules();
    vi.doMock("@/config/discord-role-mappings", () => ({
      DISCORD_TIER_ROLE_MAPPINGS: [{ tier: "district_attorney", roleIds: ["111"] }],
    }));
    const { resolveTiersFromDiscordRoles } = await import("./resolve");
    expect(resolveTiersFromDiscordRoles(["999"])).toEqual([]);
  });
});

describe("capabilitiesForTiers / hasCapability / hasAnyCapability", () => {
  it("district attorney has every case-management capability", async () => {
    const { capabilitiesForTiers, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    const caps = capabilitiesForTiers([PERMISSION_TIERS.DISTRICT_ATTORNEY]);
    expect(caps.has(CAPABILITIES.CASES_DELETE)).toBe(true);
    expect(caps.has(CAPABILITIES.CASES_MANAGE_STAFF)).toBe(true);
  });

  it("paralegal can view but not delete cases", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    const tiers = [PERMISSION_TIERS.DA_PARALEGAL];
    expect(hasCapability(tiers, CAPABILITIES.CASES_VIEW)).toBe(true);
    expect(hasCapability(tiers, CAPABILITIES.CASES_DELETE)).toBe(false);
  });

  it("law enforcement and government tiers reach the staff portal but not case data", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    expect(hasCapability([PERMISSION_TIERS.LAW_ENFORCEMENT], CAPABILITIES.DASHBOARD_VIEW)).toBe(
      true
    );
    expect(hasCapability([PERMISSION_TIERS.LAW_ENFORCEMENT], CAPABILITIES.CASES_VIEW)).toBe(false);
    expect(hasCapability([PERMISSION_TIERS.GOVERNMENT], CAPABILITIES.CASES_VIEW)).toBe(false);
  });

  it("only law enforcement (not government) can read the bulletin", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    expect(hasCapability([PERMISSION_TIERS.LAW_ENFORCEMENT], CAPABILITIES.BULLETIN_VIEW)).toBe(
      true
    );
    expect(hasCapability([PERMISSION_TIERS.GOVERNMENT], CAPABILITIES.BULLETIN_VIEW)).toBe(false);
  });

  it("only the district attorney tier can manage the roster", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    expect(
      hasCapability([PERMISSION_TIERS.DISTRICT_ATTORNEY], CAPABILITIES.ROSTER_MANAGE)
    ).toBe(true);
    expect(hasCapability([PERMISSION_TIERS.DA_ATTORNEY], CAPABILITIES.ROSTER_MANAGE)).toBe(false);
    expect(hasCapability([PERMISSION_TIERS.DA_PARALEGAL], CAPABILITIES.ROSTER_MANAGE)).toBe(
      false
    );
  });

  it("hasAnyCapability is true if any tier grants any listed capability", async () => {
    const { hasAnyCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    const result = hasAnyCapability(
      [PERMISSION_TIERS.DA_ATTORNEY],
      [CAPABILITIES.CASES_MANAGE_STAFF, CAPABILITIES.CASES_EDIT]
    );
    expect(result).toBe(true);
  });

  it("an empty tier list has no capabilities", async () => {
    const { hasAnyCapability, CAPABILITIES } = await freshResolveModule();
    expect(hasAnyCapability([], [CAPABILITIES.DASHBOARD_VIEW])).toBe(false);
  });
});

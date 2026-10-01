import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { RobloxGroupRole } from "@/lib/roblox/types";

const LE_GROUP = 1001;
const DA_GROUP = 32985413;

async function freshResolveModule() {
  vi.resetModules();
  const resolve = await import("./resolve");
  const tiers = await import("./tiers");
  const capabilities = await import("./capabilities");
  return { ...resolve, ...tiers, ...capabilities };
}

describe("resolveTiersFromRobloxRoles", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("grants Roblox DA tiers only for exact group and role IDs", async () => {
    const { resolveTiersFromRobloxRoles, PERMISSION_TIERS } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      { groupId: DA_GROUP, groupName: "Harrison County District Attorney's Office", roleId: 100901327, roleName: "District Attorney", rank: 43 },
    ];
    expect(resolveTiersFromRobloxRoles(roles)).toEqual([PERMISSION_TIERS.DISTRICT_ATTORNEY]);
  });

  it("does not grant staff access to general members or provisional staff", async () => {
    const { resolveTiersFromRobloxRoles } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      { groupId: DA_GROUP, groupName: "Harrison County District Attorney's Office", roleId: 12884901889, roleName: "Member", rank: 1 },
      { groupId: DA_GROUP, groupName: "Harrison County District Attorney's Office", roleId: 788467063, roleName: "Provisional Staffer", rank: 7 },
    ];
    expect(resolveTiersFromRobloxRoles(roles)).toEqual([]);
  });

  it("grants the tier mapped to the exact role ID", async () => {
    const { resolveTiersFromRobloxRoles, PERMISSION_TIERS } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      { groupId: DA_GROUP, groupName: "Harrison County District Attorney's Office", roleId: 100910644, roleName: "Special Investigator", rank: 19 },
    ];
    expect(resolveTiersFromRobloxRoles(roles)).toEqual([PERMISSION_TIERS.SPECIAL_INVESTIGATIONS]);
  });

  it("does not cross-match a staff role ID from a different group", async () => {
    const { resolveTiersFromRobloxRoles, PERMISSION_TIERS } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      { groupId: LE_GROUP, groupName: "Other group", roleId: 100901327, roleName: "District Attorney", rank: 43 },
    ];
    const tiers = resolveTiersFromRobloxRoles(roles);
    expect(tiers).toEqual([]);
    expect(tiers).not.toContain(PERMISSION_TIERS.DISTRICT_ATTORNEY);
  });

  it("supports multiple configured mappings", async () => {
    const { resolveTiersFromRobloxRoles, PERMISSION_TIERS } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      { groupId: DA_GROUP, groupName: "DA's Office", roleId: 100910625, roleName: "Assistant District Attorney", rank: 27 },
      { groupId: DA_GROUP, groupName: "DA's Office", roleId: 100910635, roleName: "Executive Secretary", rank: 23 },
    ];
    const tiers = resolveTiersFromRobloxRoles(roles);
    expect(tiers).toContain(PERMISSION_TIERS.DA_ATTORNEY);
    expect(tiers).toContain(PERMISSION_TIERS.DA_PARALEGAL);
    expect(tiers).toHaveLength(2);
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

  it("removes the mapped tier immediately when the provider role is revoked", async () => {
    vi.resetModules();
    vi.doMock("@/config/discord-role-mappings", () => ({
      DISCORD_TIER_ROLE_MAPPINGS: [{ tier: "district_attorney", roleIds: ["111"] }],
    }));
    const { resolveTiersFromDiscordRoles } = await import("./resolve");
    expect(resolveTiersFromDiscordRoles(["111"])).toEqual(["district_attorney"]);
    expect(resolveTiersFromDiscordRoles([])).toEqual([]);
  });
});

describe("capabilitiesForTiers / hasCapability / hasAnyCapability", () => {
  it("district attorney has every case-management capability", async () => {
    const { capabilitiesForTiers, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    const caps = capabilitiesForTiers([PERMISSION_TIERS.DISTRICT_ATTORNEY]);
    expect(caps.has(CAPABILITIES.CASES_DELETE)).toBe(true);
    expect(caps.has(CAPABILITIES.CASES_ASSIGN)).toBe(true);
  });

  it("paralegal can view all cases and propose edits, but not delete or assign", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    const tiers = [PERMISSION_TIERS.DA_PARALEGAL];
    expect(hasCapability(tiers, CAPABILITIES.CASES_VIEW)).toBe(true);
    expect(hasCapability(tiers, CAPABILITIES.CASES_VIEW_ALL)).toBe(true);
    expect(hasCapability(tiers, CAPABILITIES.CASES_PROPOSE_EDIT)).toBe(true);
    expect(hasCapability(tiers, CAPABILITIES.CASES_DELETE)).toBe(false);
    expect(hasCapability(tiers, CAPABILITIES.CASES_ASSIGN)).toBe(false);
  });

  it("ADA cannot view all cases, but supervising ADA and above can", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    expect(hasCapability([PERMISSION_TIERS.DA_ATTORNEY], CAPABILITIES.CASES_VIEW_ALL)).toBe(false);
    expect(hasCapability([PERMISSION_TIERS.DA_ATTORNEY], CAPABILITIES.CASES_ASSIGN)).toBe(false);
    expect(hasCapability([PERMISSION_TIERS.SUPERVISING_ADA], CAPABILITIES.CASES_VIEW_ALL)).toBe(true);
    expect(hasCapability([PERMISSION_TIERS.SUPERVISING_ADA], CAPABILITIES.CASES_ASSIGN)).toBe(true);
    expect(hasCapability([PERMISSION_TIERS.SUPERVISING_ADA], CAPABILITIES.CASES_APPROVE_EDITS)).toBe(
      true
    );
  });

  it("law enforcement cannot reach the staff dashboard or case data", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    expect(hasCapability([PERMISSION_TIERS.LAW_ENFORCEMENT], CAPABILITIES.DASHBOARD_VIEW)).toBe(
      false
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
      [CAPABILITIES.CASES_ASSIGN, CAPABILITIES.CASES_EDIT]
    );
    expect(result).toBe(true);
  });

  it("an empty tier list has no capabilities", async () => {
    const { hasAnyCapability, CAPABILITIES } = await freshResolveModule();
    expect(hasAnyCapability([], [CAPABILITIES.DASHBOARD_VIEW])).toBe(false);
  });

  it("allows SIB to submit case openings without granting review or full-docket access", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    expect(hasCapability([PERMISSION_TIERS.SPECIAL_INVESTIGATIONS], CAPABILITIES.CASES_CREATE)).toBe(true);
    expect(hasCapability([PERMISSION_TIERS.SPECIAL_INVESTIGATIONS], CAPABILITIES.CASES_VIEW)).toBe(true);
    expect(hasCapability([PERMISSION_TIERS.SPECIAL_INVESTIGATIONS], CAPABILITIES.CASES_APPROVE_EDITS)).toBe(false);
    expect(hasCapability([PERMISSION_TIERS.SPECIAL_INVESTIGATIONS], CAPABILITIES.CASES_VIEW_ALL)).toBe(false);
  });

  it("Supervising ADA and District Attorney can review case openings", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    expect(hasCapability([PERMISSION_TIERS.SUPERVISING_ADA], CAPABILITIES.CASES_APPROVE_EDITS)).toBe(
      true
    );
    expect(hasCapability([PERMISSION_TIERS.DISTRICT_ATTORNEY], CAPABILITIES.CASES_APPROVE_EDITS)).toBe(
      true
    );
  });

  it("only District Attorney can manage site settings", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    expect(
      hasCapability([PERMISSION_TIERS.DISTRICT_ATTORNEY], CAPABILITIES.SETTINGS_MANAGE)
    ).toBe(true);
    expect(
      hasCapability([PERMISSION_TIERS.SUPERVISING_ADA], CAPABILITIES.SETTINGS_MANAGE)
    ).toBe(false);
    expect(
      hasCapability([PERMISSION_TIERS.DA_ATTORNEY], CAPABILITIES.SETTINGS_MANAGE)
    ).toBe(false);
  });

  it("developer profile grants every capability, including against explicit deny markers", async () => {
    const { hasCapability, DEVELOPER_PROFILE_TIER, CAPABILITIES } = await freshResolveModule();
    const developer = [DEVELOPER_PROFILE_TIER, "denycap:settings:manage"] as import("./tiers").PermissionTier[];
    for (const capability of Object.values(CAPABILITIES)) {
      expect(hasCapability(developer, capability)).toBe(true);
    }
  });
});

describe("developer profile identity matching", () => {
  it("matches the authenticated Roblox username without case sensitivity", async () => {
    const { withDeveloperProfile } = await import("@/config/developer-profiles");
    const { DEVELOPER_PROFILE_TIER } = await import("./tiers");
    expect(withDeveloperProfile("roblox", "m_ysticwavezzz", [], true)).toContain(DEVELOPER_PROFILE_TIER);
    expect(withDeveloperProfile("roblox", "M_ysticWavezzz", [], false)).not.toContain(DEVELOPER_PROFILE_TIER);
  });

  it("does not grant the profile to Discord identities or other Roblox accounts", async () => {
    const { withDeveloperProfile } = await import("@/config/developer-profiles");
    expect(withDeveloperProfile("discord", "M_ysticWavezzz", [], true)).toEqual([]);
    expect(withDeveloperProfile("roblox", "AnotherUser", [], true)).toEqual([]);
  });

  it("cannot be assigned through group-role mappings", async () => {
    const { resolveTiersFromRoleMappings, DEVELOPER_PROFILE_TIER } = await freshResolveModule();
    expect(resolveTiersFromRoleMappings(["role-id"], [{ tier: DEVELOPER_PROFILE_TIER, roleIds: ["role-id"] }])).toEqual([]);
  });
});

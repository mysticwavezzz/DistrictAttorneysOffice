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

  it("maps CADA and DDA to distinct tiers with the requested permission boundaries", async () => {
    const { resolveTiersFromRobloxRoles, PERMISSION_TIERS, CAPABILITIES, capabilitiesForTiers } = await freshResolveModule();
    const cadaRole: RobloxGroupRole = { groupId: DA_GROUP, groupName: "Harrison County District Attorney's Office", roleId: 100910606, roleName: "Chief Assistant District Attorney", rank: 35 };
    const ddaRole: RobloxGroupRole = { groupId: DA_GROUP, groupName: "Harrison County District Attorney's Office", roleId: 100910597, roleName: "Deputy District Attorney", rank: 39 };
    const cadaTiers = resolveTiersFromRobloxRoles([cadaRole]);
    const ddaTiers = resolveTiersFromRobloxRoles([ddaRole]);
    const cadaCapabilities = capabilitiesForTiers(cadaTiers);
    const ddaCapabilities = capabilitiesForTiers(ddaTiers);
    const daCapabilities = capabilitiesForTiers([PERMISSION_TIERS.DISTRICT_ATTORNEY]);

    expect(cadaTiers).toEqual([PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY]);
    expect(cadaCapabilities.has(CAPABILITIES.SETTINGS_MANAGE)).toBe(false);
    expect(cadaCapabilities.has(CAPABILITIES.CASES_VIEW_DIVISION)).toBe(true);
    expect(cadaCapabilities.has(CAPABILITIES.ROSTER_MANAGE_DIVISION)).toBe(true);
    expect(cadaCapabilities.has(CAPABILITIES.CASES_VIEW_ALL)).toBe(false);
    expect(cadaCapabilities.has(CAPABILITIES.SETTINGS_MANAGE)).toBe(false);
    expect(ddaTiers).toEqual([PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY]);
    expect(ddaCapabilities).toEqual(daCapabilities);
  });

  it("assigns each current Roblox group role its own role-specific mapping", async () => {
    const { ROBLOX_TIER_ROLE_MAPPINGS, ROBLOX_DA_GROUP_ID } = await import("@/config/roblox-role-mappings");
    const roleIds = ROBLOX_TIER_ROLE_MAPPINGS.flatMap((mapping) => mapping.roleIds);
    expect(ROBLOX_TIER_ROLE_MAPPINGS).toHaveLength(15);
    expect(new Set(ROBLOX_TIER_ROLE_MAPPINGS.map((mapping) => mapping.tier)).size).toBe(15);
    expect(new Set(roleIds).size).toBe(15);
    expect(ROBLOX_TIER_ROLE_MAPPINGS.every((mapping) => mapping.groupId === ROBLOX_DA_GROUP_ID && mapping.roleIds.length === 1)).toBe(true);
  });

  it("does not grant capabilities to general members or provisional staff", async () => {
    const { resolveTiersFromRobloxRoles, capabilitiesForTiers } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      { groupId: DA_GROUP, groupName: "Harrison County District Attorney's Office", roleId: 12884901889, roleName: "Member", rank: 1 },
      { groupId: DA_GROUP, groupName: "Harrison County District Attorney's Office", roleId: 788467063, roleName: "Provisional Staffer", rank: 7 },
    ];
    expect(capabilitiesForTiers(resolveTiersFromRobloxRoles(roles)).size).toBe(0);
  });

  it("grants the tier mapped to the exact role ID", async () => {
    const { resolveTiersFromRobloxRoles, PERMISSION_TIERS } = await freshResolveModule();
    const roles: RobloxGroupRole[] = [
      { groupId: DA_GROUP, groupName: "Harrison County District Attorney's Office", roleId: 100910644, roleName: "Special Investigator", rank: 19 },
    ];
    expect(resolveTiersFromRobloxRoles(roles)).toEqual([PERMISSION_TIERS.SPECIAL_INVESTIGATOR]);
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
    expect(tiers).toContain(PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY);
    expect(tiers).toContain(PERMISSION_TIERS.EXECUTIVE_SECRETARY);
    expect(tiers).toHaveLength(2);
  });

});

describe("capabilitiesForTiers / hasCapability / hasAnyCapability", () => {
  it("preserves full access for DA and DDA while limiting ADA to ordinary casework", async () => {
    const { capabilitiesForTiers, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    for (const tier of [PERMISSION_TIERS.DISTRICT_ATTORNEY, PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY]) {
      for (const capability of Object.values(CAPABILITIES)) expect(capabilitiesForTiers([tier]).has(capability)).toBe(true);
    }
    const ada = capabilitiesForTiers([PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY]);
    expect(ada.has(CAPABILITIES.CASES_CREATE)).toBe(true);
    expect(ada.has(CAPABILITIES.CASES_EDIT)).toBe(true);
    expect(ada.has(CAPABILITIES.CASES_PROPOSE_EDIT)).toBe(true);
    for (const capability of [CAPABILITIES.CASES_VIEW_ALL, CAPABILITIES.CASES_ASSIGN, CAPABILITIES.CASES_APPROVE_EDITS, CAPABILITIES.ROSTER_MANAGE, CAPABILITIES.SETTINGS_MANAGE]) expect(ada.has(capability)).toBe(false);
  });

  it("limits SADA and CADA to division work, with roster management reserved for CADA", async () => {
    const { capabilitiesForTiers, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    const sada = capabilitiesForTiers([PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY]);
    const cada = capabilitiesForTiers([PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY]);
    for (const capabilities of [sada, cada]) {
      expect(capabilities.has(CAPABILITIES.CASES_VIEW_DIVISION)).toBe(true);
      expect(capabilities.has(CAPABILITIES.CASES_ASSIGN_DIVISION)).toBe(true);
      expect(capabilities.has(CAPABILITIES.CASES_APPROVE_DIVISION)).toBe(true);
      expect(capabilities.has(CAPABILITIES.CASES_VIEW_ALL)).toBe(false);
      expect(capabilities.has(CAPABILITIES.CASES_APPROVE_EDITS)).toBe(false);
      expect(capabilities.has(CAPABILITIES.SETTINGS_MANAGE)).toBe(false);
    }
    expect(sada.has(CAPABILITIES.ROSTER_MANAGE_DIVISION)).toBe(false);
    expect(cada.has(CAPABILITIES.ROSTER_MANAGE_DIVISION)).toBe(true);
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

  it("legacy attorney and supervisor tiers follow the revised least-privilege model", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    expect(hasCapability([PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY], CAPABILITIES.CASES_VIEW_ALL)).toBe(false);
    expect(hasCapability([PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY], CAPABILITIES.CASES_EDIT)).toBe(true);
    expect(hasCapability([PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY], CAPABILITIES.CASES_VIEW_ALL)).toBe(false);
    expect(hasCapability([PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY], CAPABILITIES.CASES_APPROVE_DIVISION)).toBe(true);
    expect(hasCapability([PERMISSION_TIERS.SPECIAL_INVESTIGATOR], CAPABILITIES.CASES_VIEW_ALL)).toBe(false);
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

  it("each attorney leadership tier can manage the roster, while paralegals cannot", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    expect(
      hasCapability([PERMISSION_TIERS.DISTRICT_ATTORNEY], CAPABILITIES.ROSTER_MANAGE)
    ).toBe(true);
    expect(hasCapability([PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY], CAPABILITIES.ROSTER_MANAGE)).toBe(false);
    expect(hasCapability([PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY], CAPABILITIES.ROSTER_MANAGE)).toBe(true);
    expect(hasCapability([PERMISSION_TIERS.DA_PARALEGAL], CAPABILITIES.ROSTER_MANAGE)).toBe(
      false
    );
  });

  it("hasAnyCapability is true if any tier grants any listed capability", async () => {
    const { hasAnyCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    const result = hasAnyCapability([PERMISSION_TIERS.DA_ATTORNEY], [CAPABILITIES.CASES_CREATE, CAPABILITIES.CASES_EDIT]);
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
    expect(hasCapability([PERMISSION_TIERS.SUPERVISING_ADA], CAPABILITIES.CASES_APPROVE_DIVISION)).toBe(
      true
    );
    expect(hasCapability([PERMISSION_TIERS.DISTRICT_ATTORNEY], CAPABILITIES.CASES_APPROVE_EDITS)).toBe(
      true
    );
  });

  it("CADA lacks admin database access while DA, DDA, and ADA roles have it", async () => {
    const { hasCapability, PERMISSION_TIERS, CAPABILITIES } = await freshResolveModule();
    expect(
      hasCapability([PERMISSION_TIERS.DISTRICT_ATTORNEY], CAPABILITIES.SETTINGS_MANAGE)
    ).toBe(true);
    expect(hasCapability([PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY], CAPABILITIES.SETTINGS_MANAGE)).toBe(true);
    expect(hasCapability([PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY], CAPABILITIES.SETTINGS_MANAGE)).toBe(false);
    expect(hasCapability([PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY], CAPABILITIES.SETTINGS_MANAGE)).toBe(false);
    expect(
      hasCapability([PERMISSION_TIERS.SUPERVISING_ADA], CAPABILITIES.SETTINGS_MANAGE)
    ).toBe(false);
    expect(hasCapability([PERMISSION_TIERS.DA_ATTORNEY], CAPABILITIES.SETTINGS_MANAGE)).toBe(false);
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

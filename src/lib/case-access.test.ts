import { describe, expect, it } from "vitest";
import { canAccessCase, caseVisibilityWhere, canManageRosterInDivision, canManageUnassignedRosterEntry } from "./case-access";

describe("case record access boundaries", () => {
  const record = { assignedAttorneyId: "assigned-user", createdById: "creator-user", division: "Criminal Division" };
  it("allows the assigned attorney and creator to access their case", () => {
    expect(canAccessCase(["da_attorney"], "assigned-user", record)).toBe(true);
    expect(canAccessCase(["da_attorney"], "creator-user", record)).toBe(true);
  });
  it("does not allow an unrelated attorney to access a case", () => {
    expect(canAccessCase(["special_investigations"], "other-user", record)).toBe(false);
  });
  it("allows division supervisors only within their division, including drafts", () => {
    expect(canAccessCase(["senior_assistant_district_attorney"], "other-user", record, "Criminal Division")).toBe(true);
    expect(canAccessCase(["senior_assistant_district_attorney"], "other-user", record, "Civil Division")).toBe(false);
    expect(canAccessCase(["special_investigations"], "other-user", { ...record, isDraft: true })).toBe(false);
    expect(canAccessCase(["senior_assistant_district_attorney"], "other-user", { ...record, isDraft: true }, "Criminal Division")).toBe(true);
  });
  it("fails closed when a non-view-all staff member has no local user record", () => {
    expect(caseVisibilityWhere(["special_investigations"], null)).toBeNull();
  });
  it("scopes ordinary case access to ownership and division access to one unit", () => {
    expect(caseVisibilityWhere(["special_investigations"], "staff-1")).toEqual({ OR: [{ assignedAttorneyId: "staff-1" }, { createdById: "staff-1" }] });
    expect(caseVisibilityWhere(["senior_assistant_district_attorney"], null, "Criminal Division")).toBeNull();
    expect(caseVisibilityWhere(["senior_assistant_district_attorney"], "staff-1", "Criminal Division")).toEqual({ OR: [{ assignedAttorneyId: "staff-1" }, { createdById: "staff-1" }, { division: "Criminal Division" }] });
  });
});

describe("division-limited roster assignment", () => {
  const criminal = "Criminal Division";

  it("lets a CADA assign ordinary unassigned staff into their own division", () => {
    const tiers = ["chief_assistant_district_attorney"] as const;
    expect(canManageUnassignedRosterEntry([...tiers], criminal, null, "Assistant District Attorney")).toBe(true);
    expect(canManageRosterInDivision([...tiers], criminal, criminal)).toBe(true);
  });

  it("does not let a CADA edit another division, keep an unassigned entry unassigned, or assign office leadership", () => {
    const tiers = ["chief_assistant_district_attorney"] as const;
    expect(canManageRosterInDivision([...tiers], criminal, "Civil Division")).toBe(false);
    expect(canManageRosterInDivision([...tiers], criminal, null)).toBe(false);
    expect(canManageUnassignedRosterEntry([...tiers], criminal, null, "District Attorney")).toBe(false);
    expect(canManageUnassignedRosterEntry([...tiers], null, null, "Assistant District Attorney")).toBe(false);
  });

  it("keeps office-wide roster managers on their existing global path", () => {
    const tiers = ["deputy_district_attorney"] as const;
    expect(canManageRosterInDivision([...tiers], null, "Civil Division")).toBe(true);
    expect(canManageUnassignedRosterEntry([...tiers], null, null, "Assistant District Attorney")).toBe(false);
  });
});

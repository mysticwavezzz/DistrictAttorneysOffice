import { describe, expect, it } from "vitest";
import { canAccessCase, caseVisibilityWhere, canManageRosterInDivision, canManageUnassignedRosterEntry, canManageCriminalGroupRosterEntry, canReviewDivision } from "./case-access";

describe("case record access boundaries", () => {
  const record = { assignedAttorneyId: "assigned-user", createdById: "creator-user", division: "Criminal Division", divisionGroup: "1" };
  it("allows the assigned attorney and creator to access their case", () => {
    expect(canAccessCase(["da_attorney"], "assigned-user", record)).toBe(true);
    expect(canAccessCase(["da_attorney"], "creator-user", record)).toBe(true);
  });
  it("does not allow an unrelated attorney to access a case", () => {
    expect(canAccessCase(["special_investigations"], "other-user", record)).toBe(false);
  });
  it("limits Criminal Division SADA case access to their assigned group", () => {
    expect(canAccessCase(["senior_assistant_district_attorney"], "other-user", record, "Criminal Division", "1")).toBe(true);
    expect(canAccessCase(["senior_assistant_district_attorney"], "other-user", { ...record, divisionGroup: "2" }, "Criminal Division", "1")).toBe(false);
    expect(canAccessCase(["senior_assistant_district_attorney"], "other-user", record, "Criminal Division", null)).toBe(false);
    expect(canAccessCase(["senior_assistant_district_attorney"], "other-user", record, "Civil Division")).toBe(false);
    expect(canAccessCase(["special_investigations"], "other-user", { ...record, isDraft: true })).toBe(false);
    expect(canAccessCase(["senior_assistant_district_attorney"], "other-user", { ...record, isDraft: true }, "Criminal Division", "1")).toBe(true);
  });
  it("fails closed when a non-view-all staff member has no local user record", () => {
    expect(caseVisibilityWhere(["special_investigations"], null)).toBeNull();
  });
  it("scopes ordinary case access to ownership and division access to one unit", () => {
    expect(caseVisibilityWhere(["special_investigations"], "staff-1")).toEqual({ OR: [{ assignedAttorneyId: "staff-1" }, { createdById: "staff-1" }] });
    expect(caseVisibilityWhere(["senior_assistant_district_attorney"], null, "Criminal Division")).toBeNull();
    expect(caseVisibilityWhere(["senior_assistant_district_attorney"], "staff-1", "Criminal Division", "1")).toEqual({ OR: [
      { AND: [{ OR: [{ assignedAttorneyId: "staff-1" }, { createdById: "staff-1" }] }, { division: "Criminal Division" }, { OR: [{ divisionGroup: "1" }, { divisionGroup: null, assignedAttorney: { divisionGroup: "1" } }, { divisionGroup: null, createdBy: { divisionGroup: "1" } }] }] },
      { division: "Criminal Division", OR: [{ divisionGroup: "1" }, { divisionGroup: null, assignedAttorney: { divisionGroup: "1" } }, { divisionGroup: null, createdBy: { divisionGroup: "1" } }] },
    ] });
  });
});

describe("Criminal Division group review authority", () => {
  it("allows a SADA to review only requests in their assigned group", () => {
    expect(canReviewDivision(["senior_assistant_district_attorney"], "Criminal Division", "Criminal Division", "1", "1")).toBe(true);
    expect(canReviewDivision(["senior_assistant_district_attorney"], "Criminal Division", "Criminal Division", "1", "2")).toBe(false);
    expect(canReviewDivision(["senior_assistant_district_attorney"], "Criminal Division", "Criminal Division", null, "1")).toBe(false);
  });
  it("keeps CADA review division-wide", () => {
    expect(canReviewDivision(["chief_assistant_district_attorney"], "Criminal Division", "Criminal Division", null, "2")).toBe(true);
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

describe("SADA group roster assignment", () => {
  it("lets a SADA assign ungrouped staff only into their own Criminal Division group", () => {
    const sada = ["senior_assistant_district_attorney"] as const;
    expect(canManageCriminalGroupRosterEntry([...sada], "Criminal Division", "1", "Criminal Division", null)).toBe(true);
    expect(canManageCriminalGroupRosterEntry([...sada], "Criminal Division", "1", "Criminal Division", "1")).toBe(true);
    expect(canManageCriminalGroupRosterEntry([...sada], "Criminal Division", "1", "Criminal Division", "2")).toBe(false);
    expect(canManageCriminalGroupRosterEntry([...sada], "Civil Division", "1", "Criminal Division", null)).toBe(false);
    expect(canManageCriminalGroupRosterEntry([...sada], "Criminal Division", null, "Criminal Division", null)).toBe(false);
  });
});

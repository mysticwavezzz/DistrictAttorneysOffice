import { describe, expect, it } from "vitest";
import { canAccessCase, caseVisibilityWhere } from "./case-access";

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

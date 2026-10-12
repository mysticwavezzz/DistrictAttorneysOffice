import { describe, expect, it } from "vitest";
import { canAccessCase, caseVisibilityWhere } from "./case-access";

describe("Executive Secretary division scope", () => {
  const criminalCase = { assignedAttorneyId: "other-user", createdById: "other-user", division: "Criminal Division", divisionGroup: "2" };

  it("allows access within the assigned division and denies other divisions", () => {
    expect(canAccessCase(["executive_secretary"], "staff-user", criminalCase, "Criminal Division")).toBe(true);
    expect(canAccessCase(["executive_secretary"], "staff-user", { ...criminalCase, division: "Civil Division" }, "Criminal Division")).toBe(false);
    expect(canAccessCase(["executive_secretary"], "staff-user", criminalCase, null)).toBe(false);
  });

  it("returns a division-only docket scope and fails closed without an assignment", () => {
    expect(caseVisibilityWhere(["executive_secretary"], "staff-user", "Criminal Division")).toEqual({ division: "Criminal Division" });
    expect(caseVisibilityWhere(["executive_secretary"], "staff-user", null)).toEqual({ id: "__no_division__" });
  });
});

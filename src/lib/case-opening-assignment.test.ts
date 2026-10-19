import { describe, expect, it } from "vitest";
import { requiresCriminalDivisionGroupForCaseCreation } from "./criminal-case-assignment";

describe("criminal case opening group requirement", () => {
  it("requires a group for group-assigned attorney tiers", () => {
    expect(requiresCriminalDivisionGroupForCaseCreation(["assistant_district_attorney"], "Criminal Division")).toBe(true);
    expect(requiresCriminalDivisionGroupForCaseCreation(["da_attorney"], "Criminal Division")).toBe(true);
    expect(requiresCriminalDivisionGroupForCaseCreation(["senior_assistant_district_attorney"], "Criminal Division")).toBe(true);
  });

  it("does not require a group for division-level administrators or non-criminal cases", () => {
    expect(requiresCriminalDivisionGroupForCaseCreation(["executive_secretary"], "Criminal Division")).toBe(false);
    expect(requiresCriminalDivisionGroupForCaseCreation(["chief_assistant_district_attorney"], "Criminal Division")).toBe(false);
    expect(requiresCriminalDivisionGroupForCaseCreation(["assistant_district_attorney"], "Civil Division")).toBe(false);
  });
});

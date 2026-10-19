import { describe, expect, it } from "vitest";
import { PERMISSION_TIERS, DEVELOPER_PROFILE_TIER } from "@/lib/permissions/tiers";
import { shouldRequireFilingApproval } from "./filing-approval";

describe("case filing approval requirement", () => {
  it("requires review for staff without filing approval authority", () => {
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY], "Criminal Division")).toBe(true);
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.SPECIAL_INVESTIGATOR], "Criminal Division")).toBe(true);
  });

  it("requires every filing to enter review, including division supervisors", () => {
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY], "Criminal Division")).toBe(true);
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY], null)).toBe(true);
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY], null)).toBe(true);
  });

  it("requires review for office-wide reviewers and Developer Profile too", () => {
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY], null)).toBe(true);
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.DISTRICT_ATTORNEY], null)).toBe(true);
    expect(shouldRequireFilingApproval([DEVELOPER_PROFILE_TIER], null)).toBe(true);
  });
});

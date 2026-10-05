import { describe, expect, it } from "vitest";
import { PERMISSION_TIERS, DEVELOPER_PROFILE_TIER } from "@/lib/permissions/tiers";
import { shouldRequireFilingApproval } from "./filing-approval";

describe("case filing approval requirement", () => {
  it("requires review for staff without filing approval authority", () => {
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY], "Criminal Division")).toBe(true);
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.SPECIAL_INVESTIGATOR], "Criminal Division")).toBe(true);
  });

  it("lets division supervisors file directly only when assigned to a division", () => {
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY], "Criminal Division")).toBe(false);
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY], null)).toBe(true);
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY], null)).toBe(true);
  });

  it("lets office-wide reviewers and Developer Profile file directly", () => {
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY], null)).toBe(false);
    expect(shouldRequireFilingApproval([PERMISSION_TIERS.DISTRICT_ATTORNEY], null)).toBe(false);
    expect(shouldRequireFilingApproval([DEVELOPER_PROFILE_TIER], null)).toBe(false);
  });
});

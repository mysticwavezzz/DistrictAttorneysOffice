import { describe, expect, it } from "vitest";
import { applyRosterRankOverride, canAssignStaffRank, canControlStaff, effectiveRosterRank, replaceGroupRankTier } from "./staff-rank-control";

it("uses a manual roster rank override when determining the effective staff rank", () => {
  expect(effectiveRosterRank("Assistant District Attorney", "Senior Assistant District Attorney")).toBe("Senior Assistant District Attorney");
  expect(effectiveRosterRank("Assistant District Attorney", null)).toBe("Assistant District Attorney");
});

describe("staff rank and removal authority", () => {
  it("replaces a Roblox DA rank while preserving unrelated law-enforcement access", () => {
    expect(applyRosterRankOverride(["assistant_district_attorney", "law_enforcement"], "Senior Assistant District Attorney"))
      .toEqual(["law_enforcement", "senior_assistant_district_attorney"]);
    expect(applyRosterRankOverride(["assistant_district_attorney"], null)).toEqual(["assistant_district_attorney"]);
    expect(replaceGroupRankTier(["senior_assistant_district_attorney", "law_enforcement"], "Assistant District Attorney"))
      .toEqual(["law_enforcement", "assistant_district_attorney"]);
    expect(replaceGroupRankTier(["senior_assistant_district_attorney", "law_enforcement"], null))
      .toEqual(["law_enforcement"]);
  });

  it("limits a CADA to lower-ranked staff in the same division", () => {
    const actor = ["chief_assistant_district_attorney"] as const;
    expect(canControlStaff([...actor], "123", "Criminal Division", { robloxUserId: "456", unit: "Criminal Division", rank: "Senior Assistant District Attorney" })).toBe(true);
    expect(canControlStaff([...actor], "123", "Criminal Division", { robloxUserId: "456", unit: "Civil Division", rank: "Assistant District Attorney" })).toBe(false);
    expect(canControlStaff([...actor], "123", "Criminal Division", { robloxUserId: "456", unit: "Criminal Division", rank: "Chief Assistant District Attorney" })).toBe(false);
    expect(canControlStaff([...actor], "123", "Criminal Division", { robloxUserId: "123", unit: "Criminal Division", rank: "Assistant District Attorney" })).toBe(false);
    expect(canAssignStaffRank([...actor], "Senior Assistant District Attorney")).toBe(true);
    expect(canAssignStaffRank([...actor], "Deputy District Attorney")).toBe(false);
  });

  it("allows office leadership and developer access without enabling self-removal", () => {
    const target = { robloxUserId: "456", unit: null, rank: "Chief Assistant District Attorney" };
    expect(canControlStaff(["deputy_district_attorney"], "123", null, target)).toBe(true);
    expect(canControlStaff(["developer_profile"], "123", null, target)).toBe(true);
    expect(canControlStaff(["deputy_district_attorney"], "456", null, target)).toBe(false);
    expect(canControlStaff(["executive_secretary"], "123", "Criminal Division", { ...target, unit: "Criminal Division" })).toBe(false);
  });
});

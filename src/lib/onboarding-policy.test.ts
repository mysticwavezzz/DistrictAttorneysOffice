import { describe, expect, it } from "vitest";
import { isCriminalDivisionTrainee, requiresCriminalDivisionGroupForOrientation, requiresCriminalDivisionOrientation } from "@/lib/onboarding-policy";

describe("Criminal Division onboarding scope", () => {
  it("does not impose training or orientation restrictions outside the Criminal Division", () => {
    const civilRoster = { isActive: true, unit: "Civil Division", rank: "Assistant District Attorney", isProsecutorInTraining: true, orientationPending: true };
    expect(isCriminalDivisionTrainee(civilRoster)).toBe(false);
    expect(requiresCriminalDivisionOrientation(civilRoster)).toBe(false);
  });

  it("allows a CADA to acknowledge orientation without a trial-group assignment", () => {
    const cada = { isActive: true, unit: "Criminal Division", rank: "Chief Assistant District Attorney", orientationPending: true };
    expect(requiresCriminalDivisionOrientation(cada)).toBe(true);
    expect(requiresCriminalDivisionGroupForOrientation(cada.rank)).toBe(false);
  });

  it("keeps group placement required for line attorneys", () => {
    expect(requiresCriminalDivisionGroupForOrientation("Assistant District Attorney")).toBe(true);
    expect(requiresCriminalDivisionGroupForOrientation("Senior Assistant District Attorney")).toBe(true);
    expect(requiresCriminalDivisionGroupForOrientation("Deputy District Attorney")).toBe(false);
  });

  it("does not restrict inactive roster entries", () => {
    const inactive = { isActive: false, unit: "Criminal Division", rank: "Assistant District Attorney", isProsecutorInTraining: true, orientationPending: true };
    expect(isCriminalDivisionTrainee(inactive)).toBe(false);
    expect(requiresCriminalDivisionOrientation(inactive)).toBe(false);
  });
});

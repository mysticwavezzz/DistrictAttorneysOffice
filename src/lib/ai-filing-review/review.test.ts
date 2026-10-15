import { describe, expect, it } from "vitest";
import { applyFilingReviewSafetyGate } from "./review";

const verifiedCheck = {
  kind: "CHECK" as const,
  title: "Document identifier present",
  detail: "The filing includes an identifier.",
  page: 1,
  evidenceQuote: "The filing includes this verified evidence quote.",
  authorityQuote: "",
  authorityId: "NONE",
  citation: null,
  evidenceVerified: true,
  authorityEvidenceVerified: false,
};

const verifiedDefect = {
  ...verifiedCheck,
  kind: "POSSIBLE_DEFECT" as const,
  title: "Possible required item missing",
  authorityQuote: "This is the exact verified authority text excerpt.",
  authorityId: "CIV_8_A",
  citation: "Har. R. Civ. P. Rule 8(a)",
  authorityEvidenceVerified: true,
};

describe("AI filing review recommendation safety gate", () => {
  it("escalates a model approval when any human-review flag exists", () => {
    expect(applyFilingReviewSafetyGate("RECOMMENDED_APPROVAL", [{ ...verifiedCheck, kind: "HUMAN_REVIEW_FLAG" }], false))
      .toBe("ESCALATE_TO_HUMAN");
  });

  it("recommends correction only for a verified possible defect", () => {
    expect(applyFilingReviewSafetyGate("RECOMMENDED_APPROVAL", [verifiedDefect], false))
      .toBe("RECOMMENDED_RETURN_FOR_CORRECTION");
  });

  it("escalates possible defects whose PDF quote or authority cannot be verified", () => {
    expect(applyFilingReviewSafetyGate("RECOMMENDED_RETURN_FOR_CORRECTION", [{ ...verifiedDefect, authorityEvidenceVerified: false }], false))
      .toBe("ESCALATE_TO_HUMAN");
    expect(applyFilingReviewSafetyGate("RECOMMENDED_RETURN_FOR_CORRECTION", [{ ...verifiedDefect, evidenceVerified: false }], false))
      .toBe("ESCALATE_TO_HUMAN");
  });

  it("does not recommend correction when the model provided no verified defect", () => {
    expect(applyFilingReviewSafetyGate("RECOMMENDED_RETURN_FOR_CORRECTION", [verifiedCheck], false))
      .toBe("ESCALATE_TO_HUMAN");
  });

  it("escalates unreadable pages and preserves a cautious approval otherwise", () => {
    expect(applyFilingReviewSafetyGate("RECOMMENDED_APPROVAL", [], true)).toBe("ESCALATE_TO_HUMAN");
    expect(applyFilingReviewSafetyGate("RECOMMENDED_APPROVAL", [verifiedCheck], false)).toBe("RECOMMENDED_APPROVAL");
  });
});


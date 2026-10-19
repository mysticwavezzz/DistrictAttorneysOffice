import { describe, expect, it } from "vitest";
import { buildCaseDocumentContext, claimsMissingCompanion, isProbableCauseCompanion } from "./case-context";
import { guardCompanionAbsenceClaims, filingAiReviewSchema } from "./review";

const baseReview = filingAiReviewSchema.parse({
  filingType: "criminal_information",
  recommendation: "RECOMMENDED_RETURN_FOR_CORRECTION",
  summary: "The information was reviewed.",
  rationale: "The document contains its caption and charges.",
  findings: [{
    kind: "POSSIBLE_DEFECT",
    title: "Missing accompanying AOPC",
    detail: "The CI does not have an accompanying probable-cause statement.",
    page: 1,
    evidenceQuote: "The People v. Example",
    authorityQuote: "An information must be accompanied by a written statement",
    authorityId: "CRIM_2_1_2_3",
  }],
  unreadablePageNumbers: [],
});

const filing = (title: string, status = "ACCEPTED") => ({
  title,
  pdfFileName: `${title}.pdf`,
  status,
  createdAt: new Date("2026-10-14T10:00:00Z"),
});

describe("same-case document context", () => {
  it("recognizes a probable-cause filing and a separately linked AOPC", () => {
    const context = buildCaseDocumentContext(
      [filing("Criminal Information"), filing("Statement of Probable Cause", "PENDING")],
      [filing("Investigation Report", "ACCEPTED")],
    );
    expect(context.totalRecords).toBe(3);
    expect(context.documents.filter(isProbableCauseCompanion)).toHaveLength(2);
    expect(context.documents.at(0)).toMatchObject({ title: "Statement of Probable Cause", status: "PENDING" });
    expect(context.documents.at(1)).toMatchObject({ source: "LINKED_AOPC", status: "ACCEPTED" });
  });

  it("keeps the manifest bounded and discloses omitted records", () => {
    const context = buildCaseDocumentContext(
      Array.from({ length: 45 }, (_, index) => filing(`Exhibit ${index}`)),
      [filing("AOPC")],
    );
    expect(context.totalRecords).toBe(46);
    expect(context.omittedRecords).toBe(6);
    expect(context.documents).toHaveLength(40);
    expect(context.documents.at(0)?.source).toBe("LINKED_AOPC");
  });

  it("does not treat an absence claim as a verified defect when an AOPC is recorded", () => {
    const context = buildCaseDocumentContext([filing("AOPC", "PENDING")], []);
    const guarded = guardCompanionAbsenceClaims(baseReview, context);
    expect(guarded.recommendation).toBe("ESCALATE_TO_HUMAN");
    expect(guarded.findings[0]).toMatchObject({ kind: "HUMAN_REVIEW_FLAG", authorityId: "NONE" });
    expect(guarded.findings.at(0)?.detail).toContain("AOPC (PENDING)");
    expect(guarded.findings.at(0)?.detail).not.toContain("missing");
  });

  it("does not assert absence even if the portal has no linked companion", () => {
    const guarded = guardCompanionAbsenceClaims(baseReview, buildCaseDocumentContext([], []));
    expect(guarded.recommendation).toBe("ESCALATE_TO_HUMAN");
    expect(guarded.findings.at(0)?.detail).toContain("unlinked or external document may exist");
  });

  it("neutralizes absence claims in the summary and rationale without changing unrelated findings", () => {
    const review = {
      ...baseReview,
      summary: "No AOPC was attached.",
      rationale: "The statement of probable cause is missing.",
      findings: [{ ...baseReview.findings[0]!, title: "Caption present", detail: "The document has a caption." }],
    };
    const guarded = guardCompanionAbsenceClaims(review, buildCaseDocumentContext([filing("AOPC")], []));
    expect(guarded.summary).not.toMatch(/No AOPC/);
    expect(guarded.rationale).not.toMatch(/missing/);
    expect(guarded.findings).toEqual(review.findings);
    expect(claimsMissingCompanion("The filing includes an AOPC.")).toBe(false);
  });
});

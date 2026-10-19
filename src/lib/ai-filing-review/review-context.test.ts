import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCaseDocumentContext } from "./case-context";

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("@ai-sdk/groq", () => ({ groq: (modelId: string) => modelId }));
vi.mock("ai", () => ({ generateText: mocks.generateText, Output: { object: () => ({}) } }));

import { runFilingAiReview } from "./review";

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.generateText.mockReset();
});

describe("AI filing review case context", () => {
  it("sends other same-case filing metadata to the model and neutralizes a false missing-AOPC finding", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-only-key");
    mocks.generateText.mockResolvedValue({ output: {
      filingType: "criminal_information",
      recommendation: "RECOMMENDED_RETURN_FOR_CORRECTION",
      summary: "The CI has no AOPC attached.",
      rationale: "An accompanying AOPC is missing.",
      findings: [{
        kind: "POSSIBLE_DEFECT",
        title: "Missing AOPC",
        detail: "No accompanying statement of probable cause was included.",
        page: 1,
        evidenceQuote: "The People v. Example",
        authorityQuote: "An information must be accompanied by a written statement",
        authorityId: "CRIM_2_1_2_3",
      }],
      unreadablePageNumbers: [],
    } });
    const caseDocuments = buildCaseDocumentContext([{
      title: "Statement of Probable Cause",
      pdfFileName: "AOPC.pdf",
      status: "PENDING",
      createdAt: new Date("2026-10-14T10:00:00Z"),
    }], []);

    const result = await runFilingAiReview({
      pages: [{ page: 1, text: "The People v. Example. This criminal information contains the listed charges." }],
      filingTitle: "Criminal Information",
      caseType: "Criminal",
      caseDocuments,
    });

    const request = mocks.generateText.mock.calls.at(0)?.[0] as { prompt: string } | undefined;
    expect(request).toBeDefined();
    const prompt = JSON.parse(request!.prompt) as { caseDocumentManifest: { documents: Array<{ title: string; status: string }> } };
    expect(prompt.caseDocumentManifest.documents).toContainEqual(expect.objectContaining({ title: "Statement of Probable Cause", status: "PENDING" }));
    expect(result.recommendation).toBe("ESCALATE_TO_HUMAN");
    expect(result.summary).not.toMatch(/no AOPC/i);
    expect(result.verifiedFindings[0]).toMatchObject({ kind: "HUMAN_REVIEW_FLAG", authorityId: "NONE" });
    expect(result.caseDocumentContext.totalRecords).toBe(1);
  });
});

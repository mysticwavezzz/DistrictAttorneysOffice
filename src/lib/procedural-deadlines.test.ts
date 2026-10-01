import { describe, expect, it } from "vitest";
import { getOngoingObligations, getProceduralDeadlines, type ProceduralDeadlineCase } from "./procedural-deadlines";

const base: ProceduralDeadlineCase = { type: "Criminal", createdAt: new Date("2026-09-01T00:00:00Z"), discDue: null, pretrial: null, appealBy: null, arraignmentAt: null, proofOfServiceAt: null, discoveryOrderAt: null, discoveryRequestedAt: null, motionServedAt: null, verdictAt: null, sentenceAt: null, finalJudgmentAt: null };

describe("automatic court deadlines", () => {
  it("calculates criminal arraignment from case filing and labels its rule", () => {
    const deadline = getProceduralDeadlines(base).find((item) => item.key === "criminal-arraignment");
    expect(deadline?.dueDate.toISOString().slice(0, 10)).toBe("2026-09-08");
    expect(deadline?.authority).toContain("Rule 9(d)");
  });
  it("derives trigger-based dates and leaves them absent until the trigger is entered", () => {
    expect(getProceduralDeadlines(base).some((item) => item.key === "criminal-particulars")).toBe(false);
    const deadline = getProceduralDeadlines({ ...base, arraignmentAt: new Date("2026-09-03T00:00:00Z") }).find((item) => item.key === "criminal-particulars");
    expect(deadline?.dueDate.toISOString().slice(0, 10)).toBe("2026-09-10");
  });
  it("calculates the civil service, discovery, and response windows from their distinct triggers", () => {
    const deadlines = getProceduralDeadlines({ ...base, type: "Civil", discoveryOrderAt: new Date("2026-09-03Z"), discoveryRequestedAt: new Date("2026-09-05Z") });
    expect(deadlines.find((item) => item.key === "civil-service")?.dueDate.toISOString().slice(0, 10)).toBe("2026-09-08");
    expect(deadlines.find((item) => item.key === "civil-discovery-window")?.dueDate.toISOString().slice(0, 10)).toBe("2026-09-07");
    expect(deadlines.find((item) => item.key === "civil-discovery-response")?.dueDate.toISOString().slice(0, 10)).toBe("2026-09-08");
  });
  it("calculates the certiorari window from the final judgment date", () => {
    const deadline = getProceduralDeadlines({ ...base, type: "Appellate", finalJudgmentAt: new Date("2026-09-01Z") }).find((item) => item.key === "appellate-certiorari");
    expect(deadline?.dueDate.toISOString().slice(0, 10)).toBe("2026-10-01");
  });
  it("keeps the criminal discovery duty visible as ongoing rather than inventing a due date", () => {
    expect(getOngoingObligations(base)).toEqual([{ key: "criminal-discovery-duty", label: "Discovery is an immediate, ongoing duty; file and resolve motions before the pretrial hearing concludes.", authority: "Ches. R. Crim. P. Rules 11 and 12(d)(1)" }]);
    expect(getOngoingObligations({ type: "Civil" })).toEqual([]);
  });
});

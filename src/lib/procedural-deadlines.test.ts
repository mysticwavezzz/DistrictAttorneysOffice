import { describe, expect, it } from "vitest";
import { courtDeadlineDate, getOngoingObligations, getProceduralDeadlines, isCourtDeadlineOverdue, type ProceduralDeadlineCase } from "./procedural-deadlines";

const base: ProceduralDeadlineCase = { type: "Criminal", createdAt: new Date("2026-09-01T00:00:00Z"), assignedJudge: null, courtFiledAt: null, discDue: null, pretrial: null, appealBy: null, arraignmentAt: null, proofOfServiceAt: null, discoveryOrderAt: null, discoveryRequestedAt: null, motionServedAt: null, verdictAt: null, sentenceAt: null, finalJudgmentAt: null };

describe("automatic court deadlines", () => {
  it("waits for a judge and court filing before calculating arraignment", () => {
    expect(getProceduralDeadlines(base).some((item) => item.automatic)).toBe(false);
    const deadline = getProceduralDeadlines({ ...base, assignedJudge: "Judge Example", courtFiledAt: new Date("2026-09-01T00:00:00Z") }).find((item) => item.key === "criminal-arraignment");
    expect(courtDeadlineDate(deadline!.dueDate)).toBe("2026-09-08");
    expect(deadline?.dueDate.toISOString()).toBe("2026-09-09T03:59:59.999Z");
    expect(deadline?.authority).toContain("Rule 9(d)");
  });
  it("derives trigger-based dates and leaves them absent until the trigger is entered", () => {
    expect(getProceduralDeadlines(base).some((item) => item.key === "criminal-particulars")).toBe(false);
    const deadline = getProceduralDeadlines({ ...base, assignedJudge: "Judge Example", arraignmentAt: new Date("2026-09-03T00:00:00Z") }).find((item) => item.key === "criminal-particulars");
    expect(courtDeadlineDate(deadline!.dueDate)).toBe("2026-09-10");
  });
  it("calculates the civil service, discovery, and response windows from their distinct triggers", () => {
    const deadlines = getProceduralDeadlines({ ...base, type: "Civil", assignedJudge: "Judge Example", courtFiledAt: new Date("2026-09-01Z"), discoveryOrderAt: new Date("2026-09-03Z"), discoveryRequestedAt: new Date("2026-09-05Z") });
    expect(courtDeadlineDate(deadlines.find((item) => item.key === "civil-service")!.dueDate)).toBe("2026-09-08");
    expect(courtDeadlineDate(deadlines.find((item) => item.key === "civil-discovery-window")!.dueDate)).toBe("2026-09-07");
    expect(courtDeadlineDate(deadlines.find((item) => item.key === "civil-discovery-response")!.dueDate)).toBe("2026-09-08");
  });
  it("calculates the certiorari window from the final judgment date", () => {
    const deadline = getProceduralDeadlines({ ...base, type: "Appellate", assignedJudge: "Judge Example", finalJudgmentAt: new Date("2026-09-01Z") }).find((item) => item.key === "appellate-certiorari");
    expect(courtDeadlineDate(deadline!.dueDate)).toBe("2026-10-01");
  });
  it("uses a manually entered discovery deadline instead of the calculated response date", () => {
    const deadlines = getProceduralDeadlines({ ...base, type: "Civil", assignedJudge: "Judge Example", discoveryRequestedAt: new Date("2026-09-05Z"), discDue: new Date("2026-09-12Z") });
    expect(deadlines.find((item) => item.key === "manual-discDue")).toMatchObject({ automatic: false });
    expect(deadlines.some((item) => item.key === "civil-discovery-response")).toBe(false);
  });
  it("uses a manually entered appeal date instead of the calculated certiorari date", () => {
    const deadlines = getProceduralDeadlines({ ...base, type: "Appellate", assignedJudge: "Judge Example", finalJudgmentAt: new Date("2026-09-01Z"), appealBy: new Date("2026-10-15Z") });
    expect(deadlines.find((item) => item.key === "manual-appealBy")).toMatchObject({ automatic: false });
    expect(deadlines.some((item) => item.key === "appellate-certiorari")).toBe(false);
  });
  it("stops showing the arraignment due date once the actual arraignment is recorded", () => {
    const deadlines = getProceduralDeadlines({ ...base, assignedJudge: "Judge Example", courtFiledAt: new Date("2026-09-01Z"), arraignmentAt: new Date("2026-09-04Z") });
    expect(deadlines.some((item) => item.key === "criminal-arraignment")).toBe(false);
    expect(deadlines.some((item) => item.key === "criminal-particulars")).toBe(true);
  });
  it("stops showing the service due date once proof of service is recorded", () => {
    const deadlines = getProceduralDeadlines({ ...base, type: "Civil", assignedJudge: "Judge Example", courtFiledAt: new Date("2026-09-01Z"), proofOfServiceAt: new Date("2026-09-04Z") });
    expect(deadlines.some((item) => item.key === "civil-service")).toBe(false);
    expect(deadlines.some((item) => item.key === "civil-answer")).toBe(true);
  });
  it("honors the Eastern cutoff across daylight-saving changes", () => {
    const deadline = getProceduralDeadlines({ ...base, assignedJudge: "Judge Example", courtFiledAt: new Date("2026-10-26T23:00:00Z") }).find((item) => item.key === "criminal-arraignment")!;
    expect(courtDeadlineDate(deadline.dueDate)).toBe("2026-11-02");
    expect(deadline.dueDate.toISOString()).toBe("2026-11-03T04:59:59.999Z");
    expect(isCourtDeadlineOverdue(deadline.dueDate, new Date("2026-11-03T04:58:00.000Z"))).toBe(false);
    expect(isCourtDeadlineOverdue(deadline.dueDate, new Date("2026-11-03T05:00:00.000Z"))).toBe(true);
  });
  it("keeps the criminal discovery duty visible as ongoing rather than inventing a due date", () => {
    expect(getOngoingObligations(base)).toEqual([{ key: "criminal-discovery-duty", label: "Discovery is an immediate, ongoing duty; file and resolve motions before the pretrial hearing concludes.", authority: "Ches. R. Crim. P. Rules 11 and 12(d)(1)" }]);
    expect(getOngoingObligations({ type: "Civil" })).toEqual([]);
  });
});

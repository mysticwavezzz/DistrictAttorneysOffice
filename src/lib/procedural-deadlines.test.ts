import { describe, expect, it } from "vitest";
import { courtDeadlineDate, getOngoingObligations, getProceduralDeadlines, isCourtDeadlineOverdue, type ProceduralDeadlineCase } from "./procedural-deadlines";

const base: ProceduralDeadlineCase = { type: "Criminal", createdAt: new Date("2026-09-01T00:00:00Z"), assignedJudge: "Judge Example", courtFiledAt: new Date("2026-09-01T00:00:00Z"), discDue: null, pretrial: null, appealBy: null, arraignmentAt: new Date("2026-09-03T00:00:00Z"), proofOfServiceAt: new Date("2026-09-03T00:00:00Z"), discoveryOrderAt: new Date("2026-09-03T00:00:00Z"), discoveryRequestedAt: new Date("2026-09-03T00:00:00Z"), motionServedAt: new Date("2026-09-03T00:00:00Z"), verdictAt: new Date("2026-09-03T00:00:00Z"), sentenceAt: new Date("2026-09-03T00:00:00Z"), finalJudgmentAt: new Date("2026-09-03T00:00:00Z") };

describe("manual case deadlines", () => {
  it("never derives deadline dates from court events or procedural triggers", () => {
    expect(getProceduralDeadlines(base)).toEqual([]);
    expect(getProceduralDeadlines({ ...base, type: "Civil" })).toEqual([]);
    expect(getProceduralDeadlines({ ...base, type: "Appellate" })).toEqual([]);
  });

  it("shows only deadlines staff entered, in chronological order", () => {
    const deadlines = getProceduralDeadlines({
      ...base,
      discDue: new Date("2026-10-15T00:00:00Z"),
      pretrial: new Date("2026-10-10T00:00:00Z"),
      appealBy: null,
    });
    expect(deadlines.map(({ key, label, authority }) => ({ key, label, authority }))).toEqual([
      { key: "manual-pretrial", label: "Pretrial", authority: "Manually entered" },
      { key: "manual-discDue", label: "Discovery due", authority: "Manually entered" },
    ]);
    expect(deadlines.map(({ dueDate }) => dueDate)).toEqual([new Date("2026-10-11T03:59:59.999Z"), new Date("2026-10-16T03:59:59.999Z")]);
  });

  it("keeps the criminal discovery duty visible as ongoing rather than a due date", () => {
    expect(getOngoingObligations(base)).toEqual([{ key: "criminal-discovery-duty", label: "Discovery is an immediate, ongoing duty; file and resolve motions before the pretrial hearing concludes.", authority: "Ches. R. Crim. P. Rules 11 and 12(d)(1)" }]);
    expect(getOngoingObligations({ type: "Civil" })).toEqual([]);
  });

  it("compares manually entered deadlines against the current time", () => {
    const deadline = getProceduralDeadlines({ ...base, discDue: new Date("2026-10-10T00:00:00Z") })[0];
    expect(deadline?.dueDate.toISOString()).toBe("2026-10-11T03:59:59.999Z");
    expect(courtDeadlineDate(deadline!.dueDate)).toBe("2026-10-10");
    expect(isCourtDeadlineOverdue(deadline!.dueDate, new Date("2026-10-11T03:59:59.998Z"))).toBe(false);
    expect(isCourtDeadlineOverdue(deadline!.dueDate, new Date("2026-10-11T04:00:00Z"))).toBe(true);
  });

  it("uses the entered day through a daylight-saving change", () => {
    const deadline = getProceduralDeadlines({ ...base, appealBy: new Date("2026-11-02T00:00:00Z") })[0];
    expect(deadline?.dueDate.toISOString()).toBe("2026-11-03T04:59:59.999Z");
    expect(courtDeadlineDate(deadline!.dueDate)).toBe("2026-11-02");
  });
});

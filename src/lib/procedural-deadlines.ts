export type ProceduralDeadlineCase = {
  type: string | null;
  createdAt: Date;
  discDue: Date | null;
  pretrial: Date | null;
  appealBy: Date | null;
  arraignmentAt: Date | null;
  proofOfServiceAt: Date | null;
  discoveryOrderAt: Date | null;
  discoveryRequestedAt: Date | null;
  motionServedAt: Date | null;
  verdictAt: Date | null;
  sentenceAt: Date | null;
  finalJudgmentAt: Date | null;
};

export type ProceduralDeadline = { key: string; label: string; dueDate: Date; authority: string; automatic: boolean };
export type OngoingObligation = { key: string; label: string; authority: string };

function addCalendarDays(anchor: Date, days: number): Date {
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + days));
}

export function getProceduralDeadlines(item: ProceduralDeadlineCase): ProceduralDeadline[] {
  const type = (item.type ?? "").toLocaleLowerCase("en-US");
  const criminal = type.includes("criminal");
  const civil = type.includes("civil");
  const appellate = type.includes("appellate") || type.includes("appeal") || type.includes("circuit");
  const deadlines: ProceduralDeadline[] = [];
  const add = (key: string, label: string, dueDate: Date | null, authority: string, automatic = true) => {
    if (dueDate) deadlines.push({ key, label, dueDate, authority, automatic });
  };

  add("manual-discDue", "Discovery due", item.discDue, "Manually entered", false);
  add("manual-pretrial", "Pretrial", item.pretrial, "Manually entered", false);
  add("manual-appealBy", "Appeal by", item.appealBy, "Manually entered", false);
  if (criminal) {
    add("criminal-arraignment", "Arraignment", addCalendarDays(item.createdAt, 7), "Ches. R. Crim. P. Rule 9(d)");
    add("criminal-particulars", "Bill of particulars", item.arraignmentAt ? addCalendarDays(item.arraignmentAt, 7) : null, "Ches. R. Crim. P. Rule 5(e)");
    add("criminal-discovery-cutoff", "Discovery motions cutoff", item.pretrial, "Ches. R. Crim. P. Rule 12(d)(1), 12(e)(1)");
    add("criminal-motion-response", "Motion response", item.motionServedAt ? addCalendarDays(item.motionServedAt, 3) : null, "Ches. R. Crim. P. Rule 12(a)(3)");
    add("criminal-post-trial", "Post-trial motions", item.verdictAt ? addCalendarDays(item.verdictAt, 5) : null, "Ches. R. Crim. P. Rules 16(b), 16(c), 16(d)");
    add("criminal-sentence-correction", "Sentence correction", item.sentenceAt ? addCalendarDays(item.sentenceAt, 2) : null, "Ches. R. Crim. P. Rule 16(e)(1)");
  }
  if (civil) {
    add("civil-service", "Service of summons and complaint", addCalendarDays(item.createdAt, 7), "Ches. R. Civ. P. Rule 5(d)");
    add("civil-answer", "Answer to complaint", item.proofOfServiceAt ? addCalendarDays(item.proofOfServiceAt, 7) : null, "Ches. R. Civ. P. Rules 5(b), 13");
    add("civil-discovery-window", "Discovery request window", item.discoveryOrderAt ? addCalendarDays(item.discoveryOrderAt, 4) : null, "Ches. R. Civ. P. Rule 25(b)");
    add("civil-discovery-response", "Discovery response", item.discoveryRequestedAt ? addCalendarDays(item.discoveryRequestedAt, 3) : null, "Ches. R. Civ. P. Rule 25(b)");
  }
  if (appellate) add("appellate-certiorari", "Certiorari petition", item.finalJudgmentAt ? addCalendarDays(item.finalJudgmentAt, 30) : null, "Ches. Cir. Ct. Rule 13.2");

  return deadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function getOngoingObligations(item: Pick<ProceduralDeadlineCase, "type">): OngoingObligation[] {
  const type = (item.type ?? "").toLocaleLowerCase("en-US");
  if (type.includes("criminal")) {
    return [{ key: "criminal-discovery-duty", label: "Discovery is an immediate, ongoing duty; file and resolve motions before the pretrial hearing concludes.", authority: "Ches. R. Crim. P. Rules 11 and 12(d)(1)" }];
  }
  return [];
}

import { formatDateTimeInTimeZone, parseDateTimeInTimeZone } from "./time-zone";

export type ProceduralDeadlineCase = {
  type: string | null;
  createdAt: Date;
  assignedJudge?: string | null;
  courtFiledAt?: Date | null;
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

export type ProceduralDeadline = { key: string; label: string; dueDate: Date; authority: string };
export type OngoingObligation = { key: string; label: string; authority: string };

const COURT_TIME_ZONE = "America/New_York";

export function courtDeadlineDate(date: Date): string {
  return formatDateTimeInTimeZone(date, COURT_TIME_ZONE).slice(0, 10);
}

export function isCourtDeadlineOverdue(date: Date, now = new Date()): boolean {
  return date.getTime() < now.getTime();
}

function manualDeadlineCutoff(date: Date): Date {
  // Date inputs are stored at UTC midnight. Keep the entered calendar date
  // and give it the court's local end-of-day cutoff.
  const dateKey = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0
    ? date.toISOString().slice(0, 10)
    : courtDeadlineDate(date);
  const cutoff = parseDateTimeInTimeZone(`${dateKey}T23:59`, COURT_TIME_ZONE);
  if (!cutoff) throw new Error(`Could not interpret manually entered deadline ${dateKey}`);
  return new Date(cutoff.getTime() + 59_999);
}

/** Only staff-entered dates are deadlines. Event dates never produce projections. */
export function getProceduralDeadlines(item: ProceduralDeadlineCase): ProceduralDeadline[] {
  return [
    ["manual-discDue", "Discovery due", item.discDue],
    ["manual-pretrial", "Pretrial", item.pretrial],
    ["manual-appealBy", "Appeal by", item.appealBy],
  ]
    .filter((entry): entry is [string, string, Date] => entry[2] instanceof Date)
    .map(([key, label, dueDate]) => ({ key, label, dueDate: manualDeadlineCutoff(dueDate), authority: "Manually entered" }))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function getOngoingObligations(item: Pick<ProceduralDeadlineCase, "type">): OngoingObligation[] {
  const type = (item.type ?? "").toLocaleLowerCase("en-US");
  if (type.includes("criminal") || type.includes("felony") || type.includes("misdemeanor")) {
    return [{ key: "criminal-discovery-duty", label: "Discovery is an immediate, ongoing duty; file and resolve motions before the pretrial hearing concludes.", authority: "Ches. R. Crim. P. Rules 11 and 12(d)(1)" }];
  }
  return [];
}

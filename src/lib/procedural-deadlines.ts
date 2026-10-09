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

export type ProceduralDeadline = { key: string; label: string; dueDate: Date; authority: string; automatic: boolean };
export type OngoingObligation = { key: string; label: string; authority: string };

function addCalendarDays(anchor: Date, days: number): Date {
  // Date inputs are stored as UTC-midnight; event timestamps use the court's local date.
  const dateOnly = anchor.getUTCHours() === 0 && anchor.getUTCMinutes() === 0 && anchor.getUTCSeconds() === 0;
  const date = dateOnly ? anchor.toISOString().slice(0, 10) : formatDateTimeInTimeZone(anchor, COURT_TIME_ZONE).slice(0, 10);
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  const cutoff = parseDateTimeInTimeZone(`${target}T23:59`, COURT_TIME_ZONE);
  if (!cutoff) throw new Error(`Could not calculate court deadline for ${target}`);
  return new Date(cutoff.getTime() + 59_999);
}

export function courtDeadlineDate(date: Date): string {
  return formatDateTimeInTimeZone(date, COURT_TIME_ZONE).slice(0, 10);
}

export function isCourtDeadlineOverdue(date: Date, now = new Date()): boolean {
  return date.getTime() < now.getTime();
}

export function getProceduralDeadlines(item: ProceduralDeadlineCase): ProceduralDeadline[] {
  const type = (item.type ?? "").toLocaleLowerCase("en-US");
  const criminal = type.includes("criminal") || type.includes("felony") || type.includes("misdemeanor");
  const civil = type.includes("civil");
  const appellate = type.includes("appellate") || type.includes("appeal") || type.includes("circuit");
  const deadlines: ProceduralDeadline[] = [];
  const add = (key: string, label: string, dueDate: Date | null, authority: string, automatic = true) => {
    if (dueDate) deadlines.push({ key, label, dueDate, authority, automatic });
  };

  add("manual-discDue", "Discovery due", item.discDue ? addCalendarDays(item.discDue, 0) : null, "Manually entered", false);
  add("manual-pretrial", "Pretrial", item.pretrial ? addCalendarDays(item.pretrial, 0) : null, "Manually entered", false);
  add("manual-appealBy", "Appeal by", item.appealBy ? addCalendarDays(item.appealBy, 0) : null, "Manually entered", false);
  if (criminal) {
    if (item.assignedJudge) {
      add("criminal-arraignment", "Arraignment", item.courtFiledAt ? addCalendarDays(item.courtFiledAt, 7) : null, "Ches. R. Crim. P. Rule 9(d)");
      add("criminal-particulars", "Bill of particulars", item.arraignmentAt ? addCalendarDays(item.arraignmentAt, 7) : null, "Ches. R. Crim. P. Rule 5(e)");
      add("criminal-motion-response", "Motion response", item.motionServedAt ? addCalendarDays(item.motionServedAt, 3) : null, "Ches. R. Crim. P. Rule 12(a)(3)");
      add("criminal-post-trial", "Post-trial motions", item.verdictAt ? addCalendarDays(item.verdictAt, 5) : null, "Ches. R. Crim. P. Rules 16(b), 16(c), 16(d)");
      add("criminal-new-evidence", "New-trial motion (new evidence)", item.verdictAt ? addCalendarDays(item.verdictAt, 14) : null, "Ches. R. Crim. P. Rule 16(c)(1)");
      add("criminal-sentence-correction", "Sentence correction", item.sentenceAt ? addCalendarDays(item.sentenceAt, 2) : null, "Ches. R. Crim. P. Rule 16(e)(1)");
    }
  }
  if (civil) {
    if (item.assignedJudge) {
      add("civil-service", "Service of summons and complaint", item.courtFiledAt ? addCalendarDays(item.courtFiledAt, 7) : null, "Ches. R. Civ. P. Rule 5(d)");
      add("civil-answer", "Answer to complaint", item.proofOfServiceAt ? addCalendarDays(item.proofOfServiceAt, 7) : null, "Ches. R. Civ. P. Rules 5(b), 13");
      add("civil-discovery-window", "Discovery request window", item.discoveryOrderAt ? addCalendarDays(item.discoveryOrderAt, 4) : null, "Ches. R. Civ. P. Rule 25(b)");
      add("civil-discovery-response", "Discovery response", item.discoveryRequestedAt ? addCalendarDays(item.discoveryRequestedAt, 3) : null, "Ches. R. Civ. P. Rule 25(b)");
    }
  }
  if (appellate && item.assignedJudge) add("appellate-certiorari", "Certiorari petition", item.finalJudgmentAt ? addCalendarDays(item.finalJudgmentAt, 30) : null, "Ches. Cir. Ct. Rule 13.2");

  return deadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function getOngoingObligations(item: Pick<ProceduralDeadlineCase, "type">): OngoingObligation[] {
  const type = (item.type ?? "").toLocaleLowerCase("en-US");
  if (type.includes("criminal") || type.includes("felony") || type.includes("misdemeanor")) {
    return [{ key: "criminal-discovery-duty", label: "Discovery is an immediate, ongoing duty; file and resolve motions before the pretrial hearing concludes.", authority: "Ches. R. Crim. P. Rules 11 and 12(d)(1)" }];
  }
  return [];
}
import { formatDateTimeInTimeZone, parseDateTimeInTimeZone } from "./time-zone";

const COURT_TIME_ZONE = "America/New_York";

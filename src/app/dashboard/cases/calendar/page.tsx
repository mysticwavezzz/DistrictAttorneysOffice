import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser, caseVisibilityWhere } from "@/lib/case-access";
import { updateDeadlineReminderState } from "../actions";
import { getProceduralDeadlines, courtDeadlineDate, type ProceduralDeadlineCase } from "@/lib/procedural-deadlines";
import { parseDateTimeInTimeZone } from "@/lib/time-zone";
import { shareMetadata } from "@/lib/share-metadata";

export const metadata = shareMetadata("Deadline Calendar", "Review manually entered case deadlines and your reminders.", "/dashboard/cases/calendar");

type DeadlineType = string;
type CalendarCase = ProceduralDeadlineCase & { id: string; caseNumber: string; title: string; assignedAttorney: { displayName: string } | null };

function monthKey(year: number, month: number) { return `${year}-${String(month + 1).padStart(2, "0")}`; }
function eventKey(caseId: string, type: DeadlineType, date: Date) { return `${caseId}:${type}:${date.toISOString()}`; }

export default async function CaseCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) redirect("/login?error=forbidden");
  const viewer = await localUser(session.user);
  if (!viewer) redirect("/login?error=forbidden");
  const values = await searchParams;
  const match = values.month?.match(/^(\d{4})-(\d{2})$/);
  const todayKey = courtDeadlineDate(new Date());
  const year = match ? Math.min(2100, Math.max(2000, Number(match[1]))) : Number(todayKey.slice(0, 4));
  const month = match ? Math.min(11, Math.max(0, Number(match[2]) - 1)) : Number(todayKey.slice(5, 7)) - 1;
  const start = new Date(Date.UTC(year, month, 1));
  const nextMonth = new Date(Date.UTC(year, month + 1, 1));
  const startKey = monthKey(year, month);
  const endKey = monthKey(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth());
  const startInstant = parseDateTimeInTimeZone(`${startKey}-01T00:00`, "America/New_York")!;
  const endInstant = parseDateTimeInTimeZone(`${endKey}-01T00:00`, "America/New_York")!;
  const visibility = caseVisibilityWhere(session.user.tiers, viewer.id, viewer.division, viewer.divisionGroup);
  if (!visibility) redirect("/login?error=forbidden");
  const where: Prisma.CaseWhereInput = { AND: [visibility, { archived: false, isDraft: false }] };
  let cases: CalendarCase[] = [];
  let loadFailed = false;
  try { cases = await prisma.case.findMany({ where, select: { id: true, caseNumber: true, title: true, type: true, createdAt: true, assignedJudge: true, courtFiledAt: true, assignedAttorney: { select: { displayName: true } }, discDue: true, pretrial: true, appealBy: true, arraignmentAt: true, proofOfServiceAt: true, discoveryOrderAt: true, discoveryRequestedAt: true, motionServedAt: true, verdictAt: true, sentenceAt: true, finalJudgmentAt: true }, orderBy: { caseNumber: "asc" }, take: 2000 }); }
  catch (error) { console.error("Failed to load deadline calendar", error); loadFailed = true; }
  // Older reminders stored a date-only deadline at UTC midnight. Include that
  // first-of-month instant so existing acknowledgments survive the court-time
  // cutoff change instead of silently reappearing as new reminders.
  const legacyStartInstant = start < startInstant ? start : startInstant;
  const reminderRows = cases.length ? await prisma.deadlineReminder.findMany({ where: { userId: viewer.id, caseId: { in: cases.map((item) => item.id) }, dueDate: { gte: legacyStartInstant, lt: endInstant } } }) : [];
  const reminderMap = new Map(reminderRows.map((item) => [eventKey(item.caseId, item.deadlineType, item.dueDate), item]));
  const legacyReminderMap = new Map(reminderRows.filter((item) => item.dueDate.getUTCHours() === 0 && item.dueDate.getUTCMinutes() === 0 && item.dueDate.getUTCSeconds() === 0).map((item) => [`${item.caseId}:${item.deadlineType}:${item.dueDate.toISOString().slice(0, 10)}`, item]));
  const events = cases.flatMap((item) => getProceduralDeadlines(item).filter((deadline) => { const date = courtDeadlineDate(deadline.dueDate); return date >= `${startKey}-01` && date < `${endKey}-01`; }).map((deadline) => ({ item, type: deadline.key, deadline, date: deadline.dueDate, reminder: reminderMap.get(eventKey(item.id, deadline.key, deadline.dueDate)) ?? legacyReminderMap.get(`${item.id}:${deadline.key}:${courtDeadlineDate(deadline.dueDate)}`) })));
  const previous = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));
  const title = start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const padding = start.getUTCDay();
  const byDay = new Map<number, typeof events>();
  for (const event of events) {
    const day = Number(courtDeadlineDate(event.date).slice(8, 10));
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }

  return <div>
    <p className="eyebrow">Cases</p><h1>Deadline Calendar</h1>
    <p className="note-inline">Only deadlines entered by staff appear here. Acknowledgment and snooze settings are personal to your account.</p>
    <nav className="tabs-row calendar-month-nav" aria-label="Calendar month"><Link href={`/dashboard/cases/calendar?month=${monthKey(previous.getUTCFullYear(), previous.getUTCMonth())}`}>← Previous month</Link><strong aria-live="polite">{title}</strong><Link href={`/dashboard/cases/calendar?month=${monthKey(next.getUTCFullYear(), next.getUTCMonth())}`}>Next month →</Link><Link href="/dashboard/cases/calendar">Today</Link></nav>
    <div className="deadline-calendar" role="grid" aria-label={`${title} deadlines`}>
      {[
        ...["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((weekday) => <div className="deadline-calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>),
        ...Array.from({ length: padding }, (_, index) => <div className="deadline-calendar-day blank" role="gridcell" aria-hidden="true" key={`blank-${index}`} />),
        ...Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          return <div className={`deadline-calendar-day${key === todayKey ? " today" : ""}`} role="gridcell" key={key} aria-label={`${key}, ${byDay.get(day)?.length ?? 0} deadlines`}>
            <strong>{day}</strong>
            {(byDay.get(day) ?? []).map((event) => {
              const acknowledged = Boolean(event.reminder?.acknowledgedAt);
              const snoozed = event.reminder?.snoozedUntil && event.reminder.snoozedUntil > new Date();
              return <article className="deadline-calendar-event" key={`${event.item.id}-${event.type}`}>
                <Link href={`/dashboard/cases/${event.item.id}`}><strong>{event.item.caseNumber}</strong> · {event.deadline.label}</Link>
                <span>{event.date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })} · {event.item.assignedAttorney?.displayName ?? "Unassigned"}</span>
                {acknowledged ? <span className="pill pill-green">Acknowledged</span> : snoozed ? <span className="pill pill-gold">Snoozed until {event.reminder!.snoozedUntil!.toLocaleDateString()}</span> : <div className="deadline-reminder-actions">
                  <form action={updateDeadlineReminderState}><input type="hidden" name="caseId" value={event.item.id}/><input type="hidden" name="deadlineType" value={event.type}/><input type="hidden" name="dueDate" value={event.date.toISOString()}/><button type="submit" name="operation" value="acknowledge" className="linklike">Acknowledge</button></form>
                  <form action={updateDeadlineReminderState}><input type="hidden" name="caseId" value={event.item.id}/><input type="hidden" name="deadlineType" value={event.type}/><input type="hidden" name="dueDate" value={event.date.toISOString()}/><label className="sr-only" htmlFor={`snooze-${event.item.id}-${event.type}`}>Snooze reminder</label><select id={`snooze-${event.item.id}-${event.type}`} name="snoozeDays" defaultValue="3"><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option></select><button type="submit" name="operation" value="snooze" className="linklike">Snooze</button></form>
                </div>}
              </article>;
            })}
          </div>;
        }),
      ]}
    </div>
    {loadFailed ? <div className="message error" role="alert">The deadline calendar could not be loaded. Retry the page or contact support if it keeps failing.</div> : !events.length && <div className="message">No case deadlines this month.</div>}
  </div>;
}

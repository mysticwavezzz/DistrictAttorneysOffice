import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";
import { updateDeadlineReminderState } from "../actions";

const deadlineLabels = { discDue: "Discovery due", pretrial: "Pretrial", appealBy: "Appeal" } as const;
type DeadlineType = keyof typeof deadlineLabels;
type CalendarCase = { id: string; caseNumber: string; title: string; assignedAttorney: { displayName: string } | null; discDue: Date | null; pretrial: Date | null; appealBy: Date | null };

function monthKey(year: number, month: number) { return `${year}-${String(month + 1).padStart(2, "0")}`; }
function eventKey(caseId: string, type: DeadlineType, date: Date) { return `${caseId}:${type}:${date.toISOString()}`; }

export default async function CaseCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) redirect("/login?error=forbidden");
  const viewer = await localUser(session.user.discordUserId);
  if (!viewer) redirect("/login?error=forbidden");
  const values = await searchParams;
  const match = values.month?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = match ? Math.min(2100, Math.max(2000, Number(match[1]))) : now.getUTCFullYear();
  const month = match ? Math.min(11, Math.max(0, Number(match[2]) - 1)) : now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const viewAll = hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL);
  const where: Prisma.CaseWhereInput = { archived: false, OR: [{ discDue: { gte: start, lt: end } }, { pretrial: { gte: start, lt: end } }, { appealBy: { gte: start, lt: end } }] };
  if (!viewAll) where.AND = [{ OR: [{ assignedAttorneyId: viewer.id }, { createdById: viewer.id }] }];
  let cases: CalendarCase[] = [];
  try { cases = await prisma.case.findMany({ where, select: { id: true, caseNumber: true, title: true, assignedAttorney: { select: { displayName: true } }, discDue: true, pretrial: true, appealBy: true }, orderBy: { caseNumber: "asc" } }); }
  catch (error) { console.error("Failed to load deadline calendar", error); }
  const reminderRows = cases.length ? await prisma.deadlineReminder.findMany({ where: { userId: viewer.id, caseId: { in: cases.map((item) => item.id) }, dueDate: { gte: start, lt: end } } }).catch(() => []) : [];
  const reminderMap = new Map(reminderRows.map((item) => [eventKey(item.caseId, item.deadlineType as DeadlineType, item.dueDate), item]));
  const events = cases.flatMap((item) => (Object.keys(deadlineLabels) as DeadlineType[]).flatMap((type) => {
    const date = item[type];
    return date ? [{ item, type, date, reminder: reminderMap.get(eventKey(item.id, type, date)) }] : [];
  }));
  const previous = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));
  const title = start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const padding = start.getUTCDay();
  const todayKey = new Date().toISOString().slice(0, 10);
  const byDay = new Map<number, typeof events>();
  for (const event of events) {
    const day = event.date.getUTCDate();
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }

  return <div>
    <p className="eyebrow">Cases</p><h1>Deadline Calendar</h1>
    <p className="note-inline">Deadlines are limited to cases you can access. Acknowledgment and snooze settings are personal to your account.</p>
    <nav className="tabs-row" aria-label="Calendar month"><Link href={`/dashboard/cases/calendar?month=${monthKey(previous.getUTCFullYear(), previous.getUTCMonth())}`}>← Previous month</Link><strong aria-live="polite">{title}</strong><Link href={`/dashboard/cases/calendar?month=${monthKey(next.getUTCFullYear(), next.getUTCMonth())}`}>Next month →</Link><Link href="/dashboard/cases/calendar">Today</Link></nav>
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
                <Link href={`/dashboard/cases/${event.item.id}`}><strong>{event.item.caseNumber}</strong> · {deadlineLabels[event.type]}</Link>
                <span>{event.date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · {event.item.assignedAttorney?.displayName ?? "Unassigned"}</span>
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
    {!events.length && <div className="message">No case deadlines this month.</div>}
  </div>;
}

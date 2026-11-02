import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { caseVisibilityWhere, localUser } from "@/lib/case-access";
import { parseDateTimeInTimeZone } from "@/lib/time-zone";
import { shareMetadata } from "@/lib/share-metadata";

export const metadata = shareMetadata("Case Calendar", "Review manually entered case dates and scheduled hearings.", "/dashboard/cases/calendar");

type CalendarCase = {
  id: string;
  caseNumber: string;
  title: string;
  assignedAttorney: { displayName: string } | null;
  initialFilingDue: Date | null;
  discDue: Date | null;
  pretrial: Date | null;
  appealBy: Date | null;
};
type CalendarItem = {
  caseId: string;
  caseNumber: string;
  title: string;
  date: Date;
  day: number;
  label: string;
  kind: "court" | "office";
  attorney: string;
  dateOnly?: boolean;
  details?: string | null;
  sourceUrl?: string | null;
};

function monthKey(year: number, month: number) { return `${year}-${String(month + 1).padStart(2, "0")}`; }
function dateKey(date: Date) {
  return date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0
    ? date.toISOString().slice(0, 10)
    : new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default async function CaseCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) redirect("/login?error=forbidden");
  const viewer = await localUser(session.user);
  if (!viewer) redirect("/login?error=forbidden");
  const values = await searchParams;
  const match = values.month?.match(/^(\d{4})-(\d{2})$/);
  const todayKey = dateKey(new Date());
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
  const cases = await prisma.case.findMany({
    where,
    select: { id: true, caseNumber: true, title: true, assignedAttorney: { select: { displayName: true } }, initialFilingDue: true, discDue: true, pretrial: true, appealBy: true },
    orderBy: { caseNumber: "asc" }, take: 2000,
  }) as CalendarCase[];
  const events = cases.length ? await prisma.caseEvent.findMany({
    where: { caseId: { in: cases.map((item) => item.id) }, startsAt: { gte: startInstant, lt: endInstant } },
    select: { id: true, caseId: true, title: true, startsAt: true, details: true, sourceUrl: true, isCourtOrdered: true },
    orderBy: { startsAt: "asc" },
  }) : [];
  const caseById = new Map(cases.map((item) => [item.id, item]));
  const items: CalendarItem[] = [];
  for (const item of cases) {
    const manualDates = [
      ["Filing target", item.initialFilingDue, "office"],
      ["Discovery date", item.discDue, "court"],
      ["Pretrial", item.pretrial, "court"],
      ["Appeal date", item.appealBy, "court"],
    ] as const;
    for (const [label, date, kind] of manualDates) {
      if (!date) continue;
      const key = dateKey(date);
      if (key < `${startKey}-01` || key >= `${endKey}-01`) continue;
      items.push({ caseId: item.id, caseNumber: item.caseNumber, title: item.title, date, day: Number(key.slice(8, 10)), label, kind, attorney: item.assignedAttorney?.displayName ?? "Unassigned", dateOnly: true });
    }
  }
  for (const event of events) {
    const item = caseById.get(event.caseId);
    if (!item) continue;
    items.push({ caseId: item.id, caseNumber: item.caseNumber, title: event.title, date: event.startsAt, day: Number(dateKey(event.startsAt).slice(8, 10)), label: event.isCourtOrdered ? "Court ordered" : "Office date", kind: event.isCourtOrdered ? "court" : "office", attorney: item.assignedAttorney?.displayName ?? "Unassigned", details: event.details, sourceUrl: event.sourceUrl });
  }
  const byDay = new Map<number, CalendarItem[]>();
  for (const item of items) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
  const previous = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));
  const title = start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const padding = start.getUTCDay();
  const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" });
  const dateOnlyFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

  return <div>
    <p className="eyebrow">Cases</p><h1>Case Calendar</h1>
    <p className="note-inline">Dates shown here come from case records or calendar entries. The portal does not generate deadline reminders.</p>
    <nav className="tabs-row calendar-month-nav" aria-label="Calendar month"><Link href={`/dashboard/cases/calendar?month=${monthKey(previous.getUTCFullYear(), previous.getUTCMonth())}`}>← Previous month</Link><strong aria-live="polite">{title}</strong><Link href={`/dashboard/cases/calendar?month=${monthKey(next.getUTCFullYear(), next.getUTCMonth())}`}>Next month →</Link><Link href="/dashboard/cases/calendar">Today</Link></nav>
    <div className="deadline-calendar" role="grid" aria-label={`${title} case dates`}>
      {[...(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((weekday) => <div className="deadline-calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>)), ...Array.from({ length: padding }, (_, index) => <div className="deadline-calendar-day blank" role="gridcell" aria-hidden="true" key={`blank-${index}`}/>), ...Array.from({ length: days }, (_, index) => {
        const day = index + 1;
        const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const entries = byDay.get(day) ?? [];
        return <div className={`deadline-calendar-day${key === todayKey ? " today" : ""}`} role="gridcell" key={key} aria-label={`${key}, ${entries.length} case date${entries.length === 1 ? "" : "s"}`}>
          <strong>{day}</strong>
          {entries.map((item, index) => <article className="deadline-calendar-event" key={`${item.caseId}-${item.label}-${index}`}>
            <Link href={`/dashboard/cases/${item.caseId}`}><strong>{item.caseNumber}</strong> · {item.label}: {item.title}</Link>
            <span>{item.dateOnly ? dateOnlyFormat.format(item.date) : dateTimeFormat.format(item.date)} · {item.attorney}</span>
            <small className={`pill ${item.kind === "court" ? "pill-navy" : "pill-gold"}`}>{item.kind === "court" ? "Court date" : "Office date"}</small>
            {item.details && <small>{item.details}</small>}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">Open source ↗</a>}
          </article>)}
        </div>;
      })]}
    </div>
    {!items.length && <div className="message">No manually entered case dates are set for this month.</div>}
  </div>;
}

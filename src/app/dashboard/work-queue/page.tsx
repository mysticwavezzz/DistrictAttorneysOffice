import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser, caseVisibilityWhere } from "@/lib/case-access";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";

export const metadata = { title: "Work Queue | DAO", robots: { index: false, follow: false } };
type QueueItem = { title: string; description: string; href: string; due: Date; kind: string };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

export default async function WorkQueuePage() {
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_DIVISION))) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const visibility = caseVisibilityWhere(session.user.tiers, user.id, user.division, user.divisionGroup);
  const cases = visibility ? await prisma.case.findMany({ where: { archived: false, AND: [visibility] }, select: { id: true, caseNumber: true, title: true, courtFiledAt: true, initialFilingDue: true, discDue: true, pretrial: true, appealBy: true, assignedAttorneyId: true, createdById: true, filings: { where: { status: "PENDING" }, select: { id: true, title: true, createdAt: true } } }, orderBy: { updatedAt: "desc" }, take: 150 }) : [];
  const now = new Date();
  const deadlineItems: QueueItem[] = [];
  for (const item of cases) {
    for (const [label, due] of [["Initial filing", item.initialFilingDue && !item.courtFiledAt ? item.initialFilingDue : null], ["Discovery", item.discDue], ["Pretrial", item.pretrial], ["Appeal", item.appealBy]] as const) {
      if (!due) continue;
      const days = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
      if (days <= 14) deadlineItems.push({ title: `${item.caseNumber} · ${label}`, description: `${item.title} · ${days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "Due today" : `Due in ${days} days`}`, href: `/dashboard/cases/${item.id}`, due, kind: days < 0 ? "Overdue" : "Deadline" });
    }
    for (const filing of item.filings) deadlineItems.push({ title: `${item.caseNumber} · ${filing.title}`, description: `${item.title} · submitted filing awaiting review`, href: `/dashboard/cases/${item.id}#filings`, due: filing.createdAt, kind: "Pending filing" });
  }
  const notifications = await prisma.notification.findMany({ where: { userId: user.id, isRead: false }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, title: true, body: true, link: true, createdAt: true } });
  const canReview = hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) || hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION);
  const intakeTickets = canReview ? await prisma.contactTicket.findMany({ where: { category: "INVESTIGATOR_INTAKE", status: "OPEN", intakeStatus: { in: ["OPEN", "NEEDS_INFO"] }, ...(hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) ? {} : { assigneeId: user.id }) }, orderBy: { updatedAt: "asc" }, take: 20, select: { id: true, subject: true, intakeStatus: true, updatedAt: true, requester: { select: { displayName: true } } } }) : [];
  deadlineItems.sort((a, b) => a.due.getTime() - b.due.getTime());
  const overdueCount = deadlineItems.filter((item) => item.kind === "Overdue").length;
  return <main className="work-queue-page"><p className="eyebrow">Staff workflow</p><div className="workbench-section-heading"><div><h1>Work Queue</h1><p className="lede">Your unread alerts, reports awaiting review, pending filings, and nearby deadlines in one place.</p></div><Link className="govbtn-outline" href="/settings?notificationView=unread#notifications">Notification history</Link></div>
    <div className="work-queue-stats"><article><strong>{notifications.length}</strong><span>Unread alerts</span></article><article><strong>{intakeTickets.length}</strong><span>Intake tickets</span></article><article><strong>{deadlineItems.filter((item) => item.kind === "Pending filing").length}</strong><span>Pending filings</span></article><article className={overdueCount ? "has-overdue" : ""}><strong>{overdueCount}</strong><span>Overdue deadlines</span></article></div>
    <div className="work-queue-grid">
      <section className="workbench-panel"><h2>Unread notifications</h2>{notifications.length ? <ul className="work-queue-list">{notifications.map((item) => <li key={item.id}><Link href={item.link ?? "/settings?notificationView=unread#notifications"}><strong>{item.title}</strong><span>{item.body ?? ""}</span><time>{dateFormat.format(item.createdAt)}</time></Link></li>)}</ul> : <p className="note-inline">No unread alerts.</p>}</section>
      {canReview && <section className="workbench-panel"><h2>Investigator intake</h2>{intakeTickets.length ? <ul className="work-queue-list">{intakeTickets.map((item) => <li key={item.id}><Link href={`/dashboard/intake/tickets/${item.id}`}><strong>{item.subject}</strong><span>{item.requester.displayName} · {item.intakeStatus}</span><time>Updated {dateFormat.format(item.updatedAt)}</time></Link></li>)}</ul> : <p className="note-inline">No investigator tickets need a response.</p>}</section>}
      <section className="workbench-panel"><h2>Filing and deadline items</h2>{deadlineItems.length ? <ul className="work-queue-list">{deadlineItems.map((item, index) => <li key={`${item.title}-${index}`}><Link href={item.href}><span className={`pill ${item.kind === "Overdue" ? "pill-red" : item.kind === "Pending filing" ? "pill-gold" : "pill-muted"}`}>{item.kind}</span><strong>{item.title}</strong><span>{item.description}</span><time>{dateFormat.format(item.due)}</time></Link></li>)}</ul> : <p className="note-inline">No deadlines in the next 14 days and no pending filings on visible cases.</p>}</section>
    </div>
  </main>;
}

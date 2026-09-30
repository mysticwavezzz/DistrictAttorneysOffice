import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TIER_DEFINITIONS, hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function DashboardOverviewPage({ searchParams }: { searchParams: Promise<{ caseSubmitted?: string }> }) {
  const query = await searchParams;
  const session = await auth();
  const tiers = session!.user.tiers;
  const canViewCases = hasCapability(tiers, CAPABILITIES.CASES_VIEW);
  const canViewAllCases = hasCapability(tiers, CAPABILITIES.CASES_VIEW_ALL);
  const canViewRoster = hasCapability(tiers, CAPABILITIES.ROSTER_VIEW);
  const canManageAnnouncements = hasCapability(tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE);
  const canApproveRequests = hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS);
  const canViewRequests = hasCapability(tiers, CAPABILITIES.REQUESTS_VIEW);
  const canCreateCases = hasCapability(tiers, CAPABILITIES.CASES_CREATE);
  const user = await localUser(session!.user);
  const personalScope = { OR: [{ assignedAttorneyId: user?.id }, { createdById: user?.id }] };
  const caseScope = canViewAllCases ? {} : personalScope;

  const [myActiveCount, deadlineCount, pendingRequestCount, newRecordsRequests, unreadCount, rosterCount, releasesThisMonth] = await Promise.all([
    canViewCases ? prisma.case.count({ where: { archived: false, ...personalScope } }).catch(() => 0) : Promise.resolve(0),
    canViewCases ? prisma.case.count({ where: { archived: false, ...caseScope, AND: [{ OR: [{ discDue: { lte: new Date(Date.now() + 3 * 86400000) } }, { pretrial: { lte: new Date(Date.now() + 3 * 86400000) } }, { appealBy: { lte: new Date(Date.now() + 3 * 86400000) } }] }] } }).catch(() => 0) : Promise.resolve(0),
    canApproveRequests ? prisma.caseActionRequest.count({ where: { status: "PENDING" } }).catch(() => 0) : Promise.resolve(0),
    canViewRequests ? prisma.recordsRequest.count({ where: { status: "NEW" } }).catch(() => 0) : Promise.resolve(0),
    user ? prisma.notification.count({ where: { userId: user.id, isRead: false } }).catch(() => 0) : Promise.resolve(0),
    canViewRoster ? prisma.rosterEntry.count().catch(() => 0) : Promise.resolve(0),
    canManageAnnouncements ? prisma.announcement.count({ where: { isPublished: true, publishedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }).catch(() => 0) : Promise.resolve(0),
  ]);

  const upcomingCases = canViewCases ? await prisma.case.findMany({
    where: { archived: false, isDraft: false, ...caseScope, AND: [{ OR: [{ discDue: { lte: new Date(Date.now() + 14 * 86400000) } }, { pretrial: { lte: new Date(Date.now() + 14 * 86400000) } }, { appealBy: { lte: new Date(Date.now() + 14 * 86400000) } }] }] },
    select: { id: true, caseNumber: true, title: true, discDue: true, pretrial: true, appealBy: true },
    orderBy: { updatedAt: "desc" }, take: 10,
  }).catch(() => []) : [];
  const recentFilings = canViewCases ? await prisma.caseFiling.findMany({
    where: { case: caseScope },
    select: { id: true, title: true, createdAt: true, case: { select: { id: true, caseNumber: true, title: true } } },
    orderBy: { createdAt: "desc" },
    take: 6,
  }).catch(() => []) : [];
  const recentActivity = hasCapability(tiers, CAPABILITIES.ACTIVITY_VIEW) ? await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }).catch(() => []) : [];

  const actionCards = [
    canViewCases && { href: "/dashboard/cases/calendar", label: "Deadlines due soon", value: deadlineCount || "Clear", action: "Open deadline calendar", urgent: deadlineCount > 0 },
    canApproveRequests && { href: "/dashboard/cases/requests?status=pending", label: "Case openings and changes to review", value: pendingRequestCount, action: "Review submissions", urgent: pendingRequestCount > 0 },
    canViewRequests && { href: "/dashboard/records-requests?status=NEW", label: "New records requests", value: newRecordsRequests, action: "Open requests", urgent: newRecordsRequests > 0 },
    { href: "/settings#notifications", label: "Unread notifications", value: unreadCount, action: "View notifications", urgent: unreadCount > 0 },
  ].filter(Boolean) as { href: string; label: string; value: number | string; action: string; urgent: boolean }[];

  return <div className="dashboard-overview">
    <p className="eyebrow">Staff Portal</p>
    <h1>Welcome, {session!.user.displayName}</h1>
    {query.caseSubmitted === "review" && <p className="message message-success" role="status">Your case opening was sent to the Supervising Assistant District Attorney and District Attorney for review. It will appear on the docket after approval.</p>}
    <p className="subtitle">{tiers.filter((tier) => tier in TIER_DEFINITIONS).map((tier) => TIER_DEFINITIONS[tier].label).join(", ") || "Staff member"}</p>

    <section aria-labelledby="attention-heading"><h2 id="attention-heading">Needs Attention</h2><p className="section-lede">Items that need a decision, assignment, or response.</p><div className="cards">{actionCards.map((card) => <Link href={card.href} className={`card card-action ${card.urgent ? "card-urgent" : ""}`} key={card.label}><span className="card-label">{card.label}</span><span className="card-value">{card.value}</span><span className="card-action-label">{card.action}</span></Link>)}</div></section>

    <section aria-labelledby="my-work-heading"><h2 id="my-work-heading">My Work</h2><p className="section-lede">Your assigned and recently created work.</p><div className="cards">{canViewCases && <Link href="/dashboard/cases?mine=1&tab=ongoing" className="card card-action"><span className="card-label">My active cases</span><span className="card-value">{myActiveCount}</span><span className="card-action-label">Open my cases</span></Link>}{canCreateCases && <Link href="/dashboard/cases/new" className="card card-action"><span className="card-label">Open a case</span><span className="card-value" aria-hidden="true">＋</span><span className="card-action-label">Start a case submission</span></Link>}</div></section>

    {canViewCases && <section aria-labelledby="deadlines-heading"><h2 id="deadlines-heading">Upcoming Deadlines</h2>{upcomingCases.length === 0 ? <div className="message message-success">No case deadlines in the next 14 days.</div> : <div className="tablewrap"><table className="stat mobile-cards"><thead><tr><th scope="col">Case</th><th scope="col">Deadline</th><th scope="col">Date</th><th scope="col">Next action</th></tr></thead><tbody>{upcomingCases.flatMap((item) => ([ ["Discovery", item.discDue], ["Pretrial", item.pretrial], ["Appeal", item.appealBy] ] as [string, Date | null][]).filter(([, date]) => date && date.getTime() <= Date.now() + 14 * 86400000).map(([label, date]) => <tr key={`${item.id}-${label}`}><td data-label="Case"><Link href={`/dashboard/cases/${item.id}`}>{item.caseNumber} - {item.title}</Link></td><td data-label="Deadline">{label}</td><td data-label="Date"><time className={date!.getTime() < Date.now() ? "deadline-overdue" : undefined} dateTime={date!.toISOString()}>{dateFormatter.format(date!)}</time></td><td data-label="Next action"><Link href={`/dashboard/cases/${item.id}`}>{date!.getTime() < Date.now() ? "Resolve overdue item" : "Review case"}</Link></td></tr>))}</tbody></table></div>}</section>}

    {canViewCases && <section aria-labelledby="recent-filings-heading"><div className="page-heading-row"><h2 id="recent-filings-heading">Recent Filings</h2><Link href="/dashboard/filings">Filing history</Link></div>{recentFilings.length ? <ul className="recent-filings-list">{recentFilings.map((filing) => <li key={filing.id}><span><Link href={`/dashboard/cases/${filing.case.id}`}><strong>{filing.case.caseNumber}</strong> · {filing.title}</Link><small>{filing.case.title}</small></span><time dateTime={filing.createdAt.toISOString()}>{dateFormatter.format(filing.createdAt)}</time></li>)}</ul> : <div className="message">No filings yet.</div>}</section>}

    {(canViewRoster || canManageAnnouncements) && <section aria-labelledby="admin-heading"><h2 id="admin-heading">Administration</h2><div className="cards">{canViewRoster && <Link href="/dashboard/roster" className="card"><span className="card-label">Staff roster</span><span className="card-value">{rosterCount}</span><span className="card-action-label">Manage staff</span></Link>}{canManageAnnouncements && <Link href="/dashboard/announcements" className="card"><span className="card-label">Releases this month</span><span className="card-value">{releasesThisMonth}</span><span className="card-action-label">Manage releases</span></Link>}</div></section>}

    {hasCapability(tiers, CAPABILITIES.ACTIVITY_VIEW) && <section aria-labelledby="activity-heading"><h2 id="activity-heading">Recent Activity</h2>{recentActivity.length === 0 ? <div className="message">No recent activity.</div> : <ul className="activity-preview">{recentActivity.map((entry) => <li key={entry.id}><span>{entry.actorName} {entry.action} {entry.targetType} &quot;{entry.targetLabel}&quot;</span><time dateTime={entry.createdAt.toISOString()}>{entry.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</time></li>)}</ul>}</section>}
  </div>;
}

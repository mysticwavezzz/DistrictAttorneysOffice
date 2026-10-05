import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TIER_DEFINITIONS, hasCapability, CAPABILITIES } from "@/lib/permissions";
import { caseVisibilityWhere, localUser, canViewCases as canViewCasesInDocket } from "@/lib/case-access";
import { getProceduralDeadlines } from "@/lib/procedural-deadlines";
import { DashboardFoldPersistence } from "@/components/dashboard-fold-persistence";
import { getPrivacyConsentGeneration } from "@/lib/site-settings";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function DashboardOverviewPage({ searchParams }: { searchParams: Promise<{ caseSubmitted?: string }> }) {
  const query = await searchParams;
  const session = await auth();
  const tiers = session!.user.tiers;
  const canViewCases = canViewCasesInDocket(tiers);
  const canViewAllCases = hasCapability(tiers, CAPABILITIES.CASES_VIEW_ALL);
  const canViewRoster = hasCapability(tiers, CAPABILITIES.ROSTER_VIEW) || hasCapability(tiers, CAPABILITIES.ROSTER_VIEW_DIVISION);
  const canManageAnnouncements = hasCapability(tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE);
  const canApproveRequests = hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS) || hasCapability(tiers, CAPABILITIES.CASES_APPROVE_DIVISION);
  const canViewRequests = hasCapability(tiers, CAPABILITIES.REQUESTS_VIEW);
  const canViewReviewInbox = canApproveRequests || canViewRequests;
  const canCreateCases = hasCapability(tiers, CAPABILITIES.CASES_CREATE);
  const [user, preferenceGeneration] = await Promise.all([localUser(session!.user), getPrivacyConsentGeneration()]);
  const preferenceAccountId = `${user?.id ?? session!.user.providerUserId}:${preferenceGeneration}`;
  const personalScope = user ? { OR: [{ assignedAttorneyId: user.id }, { createdById: user.id }] } : null;
  const caseScope = caseVisibilityWhere(tiers, user?.id, user?.division);

  const [myActiveCount, pendingRequestCount, newRecordsRequests, pendingAopcCount, unreadCount, rosterCount, releasesThisMonth] = await Promise.all([
    canViewCases && personalScope ? prisma.case.count({ where: { archived: false, ...personalScope } }).catch(() => 0) : Promise.resolve(0),
    canApproveRequests ? prisma.caseActionRequest.count({ where: { status: "PENDING", ...(hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS) ? {} : { division: user?.division ?? "__none__" }) } }).catch(() => 0) : Promise.resolve(0),
    canViewRequests ? prisma.recordsRequest.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }).catch(() => 0) : Promise.resolve(0),
    canApproveRequests ? prisma.aopc.count({ where: { status: "PENDING", ...(hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS) ? {} : { targetUnit: user?.division ?? "__none__" }) } }).catch(() => 0) : Promise.resolve(0),
    user ? prisma.notification.count({ where: { userId: user.id, isRead: false } }).catch(() => 0) : Promise.resolve(0),
    canViewRoster ? prisma.rosterEntry.count({ where: hasCapability(tiers, CAPABILITIES.ROSTER_VIEW) ? {} : { unit: user?.division ?? "__none__" } }).catch(() => 0) : Promise.resolve(0),
    canManageAnnouncements ? prisma.announcement.count({ where: { isPublished: true, publishedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }).catch(() => 0) : Promise.resolve(0),
  ]);

  const deadlineCases = canViewCases && caseScope ? await prisma.case.findMany({ where: { archived: false, isDraft: false, ...caseScope }, orderBy: { updatedAt: "desc" }, take: 5000 }).catch(() => []) : [];
  const now = new Date();
  const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
  const deadlineRows = deadlineCases.flatMap((item) => getProceduralDeadlines(item).map((deadline) => ({ item, deadline })))
    .filter(({ deadline }) => deadline.dueDate.getTime() < today.getTime() + 14 * 86400000)
    .sort((a, b) => a.deadline.dueDate.getTime() - b.deadline.dueDate.getTime());
  const deadlineCount = deadlineRows.filter(({ deadline }) => deadline.dueDate.getTime() < today.getTime() + 4 * 86400000).length;
  const upcomingDeadlines = deadlineRows.slice(0, 40);
  const recentFilings = canViewCases && caseScope ? await prisma.caseFiling.findMany({
    where: { case: caseScope },
    select: { id: true, title: true, createdAt: true, case: { select: { id: true, caseNumber: true, title: true } } },
    orderBy: { createdAt: "desc" },
    take: 6,
  }).catch(() => []) : [];
  const recentActivity = hasCapability(tiers, CAPABILITIES.ACTIVITY_VIEW) ? await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }).catch(() => []) : [];

  const actionCards = [
    canViewCases && { href: "/dashboard/cases/calendar", label: "Deadlines due soon", value: deadlineCount || "Clear", action: "Open deadline calendar", urgent: deadlineCount > 0 },
    canViewReviewInbox && { href: "/dashboard/review", label: "Items awaiting review", value: pendingRequestCount + newRecordsRequests + pendingAopcCount, action: "Open Review Inbox", urgent: pendingRequestCount + newRecordsRequests + pendingAopcCount > 0 },
    { href: "/settings#notifications", label: "Unread notifications", value: unreadCount, action: "View notifications", urgent: unreadCount > 0 },
  ].filter(Boolean) as { href: string; label: string; value: number | string; action: string; urgent: boolean }[];

  return <div className="dashboard-overview">
    <DashboardFoldPersistence accountId={preferenceAccountId} />
    <p className="eyebrow">Staff Portal</p>
    <h1>Welcome, {session!.user.displayName}</h1>
    {query.caseSubmitted === "review" && <p className="message message-success" role="status">Your case opening was sent to an authorized reviewer for your division. It will appear on the docket after approval.</p>}
    <p className="subtitle">{tiers.filter((tier) => tier in TIER_DEFINITIONS).map((tier) => TIER_DEFINITIONS[tier].label).join(", ") || "Staff member"}</p>

    <details className="dashboard-fold" open><summary id="attention-heading"><span className="dashboard-fold-title">Needs Attention</span></summary><section aria-labelledby="attention-heading"><p className="section-lede">Items that need a decision, assignment, or response.</p><div className="cards">{actionCards.map((card) => <Link href={card.href} className={`card card-action ${card.urgent ? "card-urgent" : ""}`} key={card.label}><span className="card-label">{card.label}</span><span className="card-value">{card.value}</span><span className="card-action-label">{card.action}</span></Link>)}</div></section></details>

    <details className="dashboard-fold" open><summary id="my-work-heading"><span className="dashboard-fold-title">My Work</span></summary><section aria-labelledby="my-work-heading"><p className="section-lede">Your assigned and recently created work.</p><div className="cards">{canViewCases && <Link href="/dashboard/cases?mine=1&tab=ongoing" className="card card-action"><span className="card-label">My active cases</span><span className="card-value">{myActiveCount}</span><span className="card-action-label">Open my cases</span></Link>}{canCreateCases && <Link href="/dashboard/cases/new" className="card card-action"><span className="card-label">Open a case</span><span className="card-value" aria-hidden="true">＋</span><span className="card-action-label">Start a case submission</span></Link>}</div></section></details>

    {canViewCases && <details className="dashboard-fold" open><summary id="deadlines-heading"><span className="dashboard-fold-title">Upcoming Deadlines</span></summary><section aria-labelledby="deadlines-heading">{upcomingDeadlines.length === 0 ? <div className="message message-success">No case deadlines in the next 14 days.</div> : <div className="tablewrap"><table className="stat mobile-cards"><thead><tr><th scope="col">Case</th><th scope="col">Deadline</th><th scope="col">Date</th><th scope="col">Next action</th></tr></thead><tbody>{upcomingDeadlines.map(({ item, deadline }) => <tr key={`${item.id}-${deadline.key}`}><td data-label="Case"><Link href={`/dashboard/cases/${item.id}`}>{item.caseNumber} - {item.title}</Link></td><td data-label="Deadline">{deadline.label}</td><td data-label="Date"><time className={deadline.dueDate.getTime() < today.getTime() ? "deadline-overdue" : undefined} dateTime={deadline.dueDate.toISOString()}>{dateFormatter.format(deadline.dueDate)}</time><small>{deadline.automatic ? `Calculated · ${deadline.authority}` : "Manually entered"}</small></td><td data-label="Next action"><Link href={`/dashboard/cases/${item.id}#deadlines`}>{deadline.dueDate.getTime() < today.getTime() ? "Resolve overdue item" : "Review case"}</Link></td></tr>)}</tbody></table></div>}</section></details>}

    {canViewCases && <details className="dashboard-fold" open><summary id="recent-filings-heading"><span className="dashboard-fold-title">Recent Filings</span></summary><section aria-labelledby="recent-filings-heading"><div className="page-heading-row"><Link href="/dashboard/filings">Filing history</Link></div>{recentFilings.length ? <ul className="recent-filings-list">{recentFilings.map((filing) => <li key={filing.id}><span><Link href={`/dashboard/cases/${filing.case.id}`}><strong>{filing.case.caseNumber}</strong> · {filing.title}</Link><small>{filing.case.title}</small></span><time dateTime={filing.createdAt.toISOString()}>{dateFormatter.format(filing.createdAt)}</time></li>)}</ul> : <div className="message">No filings yet.</div>}</section></details>}

    {(canViewRoster || canManageAnnouncements) && <details className="dashboard-fold" open><summary id="admin-heading"><span className="dashboard-fold-title">Administration</span></summary><section aria-labelledby="admin-heading"><div className="cards">{canViewRoster && <Link href="/dashboard/roster" className="card"><span className="card-label">Staff roster</span><span className="card-value">{rosterCount}</span><span className="card-action-label">Manage staff</span></Link>}{canManageAnnouncements && <Link href="/dashboard/announcements" className="card"><span className="card-label">Releases this month</span><span className="card-value">{releasesThisMonth}</span><span className="card-action-label">Manage releases</span></Link>}</div></section></details>}

    {hasCapability(tiers, CAPABILITIES.ACTIVITY_VIEW) && <details className="dashboard-fold" open><summary id="activity-heading"><span className="dashboard-fold-title">Recent Activity</span></summary><section aria-labelledby="activity-heading">{recentActivity.length === 0 ? <div className="message">No recent activity.</div> : <ul className="activity-preview">{recentActivity.map((entry) => <li key={entry.id}><span>{entry.actorName} {entry.action} {entry.targetType} &quot;{entry.targetLabel}&quot;</span><time dateTime={entry.createdAt.toISOString()}>{entry.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</time></li>)}</ul>}</section></details>}
  </div>;
}

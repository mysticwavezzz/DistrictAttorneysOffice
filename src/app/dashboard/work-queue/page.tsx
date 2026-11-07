import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser, caseVisibilityWhere } from "@/lib/case-access";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";

export const metadata = { title: "Work Queue | DAO", robots: { index: false, follow: false } };
type QueueItem = { title: string; description: string; href: string; createdAt: Date; kind: "Pending filing" };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

export default async function WorkQueuePage({ searchParams }: { searchParams: Promise<{ caseSubmitted?: string }> }) {
  const query = await searchParams;
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_DIVISION))) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const rosterPlacement = session.user.robloxUserId ? await prisma.rosterEntry.findUnique({ where: { robloxUserId: session.user.robloxUserId }, select: { bureau: true } }) : null;
  const visibility = caseVisibilityWhere(session.user.tiers, user.id, user.division, user.divisionGroup);
  const cases = visibility ? await prisma.case.findMany({ where: { archived: false, AND: [visibility] }, select: { id: true, caseNumber: true, title: true, filings: { where: { status: "PENDING" }, select: { id: true, title: true, createdAt: true } } }, orderBy: { updatedAt: "desc" }, take: 150 }) : [];
  const pendingFilingItems: QueueItem[] = [];
  for (const item of cases) {
    for (const filing of item.filings) pendingFilingItems.push({ title: `${item.caseNumber} · ${filing.title}`, description: `${item.title} · submitted filing awaiting review`, href: `/dashboard/cases/${item.id}#filings`, createdAt: filing.createdAt, kind: "Pending filing" });
  }
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId: user.id, type: { not: "case_deadline" }, isRead: false }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, title: true, body: true, link: true, createdAt: true } }),
    prisma.notification.count({ where: { userId: user.id, type: { not: "case_deadline" }, isRead: false } }),
  ]);
  const canReview = hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) || hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION);
  const canReviewTips = hasCapability(session.user.tiers, CAPABILITIES.TIPS_REVIEW);
  const canReviewRecords = hasCapability(session.user.tiers, CAPABILITIES.REQUESTS_VIEW);
  const canReviewInvestigator = hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) || (hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION) && user.division === "Criminal Division");
  const canReviewInbox = canReview || canReviewTips || canReviewRecords;
  const globalReview = hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS);
  const [caseRequests, pendingFilings, pendingAopcs, openTips, openInvestigatorTickets, openRecordsRequests] = await Promise.all([
    canReview ? prisma.caseActionRequest.count({ where: { status: "PENDING", ...(globalReview ? {} : { division: user.division ?? "__none__", ...(user.division === "Criminal Division" && user.divisionGroup ? { divisionGroup: user.divisionGroup } : {}) }) } }) : Promise.resolve(0),
    canReview ? prisma.caseFiling.count({ where: { status: "PENDING", ...(globalReview ? {} : { case: { division: user.division ?? "__none__", ...(user.division === "Criminal Division" && user.divisionGroup ? { OR: [{ divisionGroup: user.divisionGroup }, { divisionGroup: null, assignedAttorney: { divisionGroup: user.divisionGroup } }, { divisionGroup: null, createdBy: { divisionGroup: user.divisionGroup } }] } : {}) } }) } }) : Promise.resolve(0),
    canReview ? prisma.aopc.count({ where: { status: "PENDING", intakeTicketId: null, ...(globalReview ? {} : { targetUnit: user.division ?? "__none__" }) } }) : Promise.resolve(0),
    canReviewTips ? prisma.crimeTip.count({ where: { status: { notIn: ["CLOSED", "NO_JURISDICTION", "DUPLICATE", "INSUFFICIENT"] } } }) : Promise.resolve(0),
    canReviewInvestigator ? prisma.contactTicket.count({ where: { category: "INVESTIGATOR_INTAKE", status: { not: "CLOSED" }, intakeStatus: { notIn: ["DENIED", "CONVERTED"] }, ...(globalReview ? {} : { assigneeId: user.id, divisionGroup: user.divisionGroup ?? undefined }) } }) : Promise.resolve(0),
    canReviewRecords ? prisma.recordsRequest.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }) : Promise.resolve(0),
  ]);
  const reviewCount = caseRequests + pendingFilings + pendingAopcs + openTips + openInvestigatorTickets + openRecordsRequests;
  const intakeTickets = canReview ? await prisma.contactTicket.findMany({ where: { category: "INVESTIGATOR_INTAKE", status: "OPEN", intakeStatus: { in: ["OPEN", "NEEDS_INFO"] }, ...(hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) ? {} : { assigneeId: user.id }) }, orderBy: { updatedAt: "asc" }, take: 20, select: { id: true, subject: true, intakeStatus: true, updatedAt: true, requester: { select: { displayName: true } } } }) : [];
  pendingFilingItems.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const workspace = user.division === "Criminal Division"
    ? `Criminal Division${rosterPlacement?.bureau ? ` · ${rosterPlacement.bureau}` : ""}`
    : user.division === "Civil Division"
      ? "Civil Division"
      : user.division === "Administrative Services"
        ? "Administrative Services"
        : user.division ?? "District Attorney's Office";
  const civilOpener = user.division === "Civil Division" || session.user.tiers.includes("district_attorney") || session.user.tiers.includes("deputy_district_attorney") || session.user.tiers.includes("developer_profile");
  const criminalOpener = user.division === "Criminal Division" && hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE);
  return <main className="work-queue-page"><p className="eyebrow">{workspace}</p><div className="workbench-section-heading"><div><h1>{user.division ? `${workspace} Work Queue` : "Office Work Queue"}</h1><p className="lede">Your division&apos;s assigned work, review items, and incoming reports.</p></div><div className="work-queue-header-actions">{civilOpener && <Link className="govbtn" href="/dashboard/civil/new">Start civil matter</Link>}{criminalOpener && <Link className="govbtn-outline" href="/dashboard/cases/new">Open criminal case</Link>}<Link className="govbtn-outline" href="/settings?notificationView=unread#notifications">Notification history</Link></div></div>
    {query.caseSubmitted === "review" && <p className="message message-success" role="status">The case opening is in the Review Inbox. It will appear on the docket after approval.</p>}
    <div className="work-queue-stats">{canReviewInbox && <Link href="/dashboard/review"><strong>{reviewCount}</strong><span>Items awaiting review</span></Link>}<article><strong>{unreadCount}</strong><span>Unread alerts</span></article><article><strong>{intakeTickets.length}</strong><span>My intake tickets</span></article><article><strong>{pendingFilingItems.length}</strong><span>Pending filings</span></article></div>
    <div className="work-queue-grid">
      <section className="workbench-panel"><h2>Unread notifications</h2>{notifications.length ? <ul className="work-queue-list">{notifications.map((item) => <li key={item.id}><Link href={item.link ?? "/settings?notificationView=unread#notifications"}><strong>{item.title}</strong><span>{item.body ?? ""}</span><time>{dateFormat.format(item.createdAt)}</time></Link></li>)}</ul> : <p className="note-inline">No unread alerts.</p>}</section>
      {canReview && <section className="workbench-panel"><h2>Investigator intake</h2>{intakeTickets.length ? <ul className="work-queue-list">{intakeTickets.map((item) => <li key={item.id}><Link href={`/dashboard/intake/tickets/${item.id}`}><strong>{item.subject}</strong><span>{item.requester.displayName} · {item.intakeStatus}</span><time>Updated {dateFormat.format(item.updatedAt)}</time></Link></li>)}</ul> : <p className="note-inline">No investigator tickets need a response.</p>}</section>}
      <section className="workbench-panel"><h2>Pending filings</h2>{pendingFilingItems.length ? <ul className="work-queue-list">{pendingFilingItems.map((item) => <li key={`${item.title}-${item.createdAt.toISOString()}`}><Link href={item.href}><span className="pill pill-gold">{item.kind}</span><strong>{item.title}</strong><span>{item.description}</span><time>{dateFormat.format(item.createdAt)}</time></Link></li>)}</ul> : <p className="note-inline">No filings are awaiting review on visible cases.</p>}</section>
    </div>
  </main>;
}

import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TIER_DEFINITIONS, hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";

export default async function DashboardOverviewPage() {
  const session = await auth();
  const tiers = session!.user.tiers;

  const canViewCases = hasCapability(tiers, CAPABILITIES.CASES_VIEW);
  const canViewAllCases = hasCapability(tiers, CAPABILITIES.CASES_VIEW_ALL);
  const canViewRoster = hasCapability(tiers, CAPABILITIES.ROSTER_VIEW);
  const canManageAnnouncements = hasCapability(tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE);
  const canApproveRequests = hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS);
  const canViewRequests = hasCapability(tiers, CAPABILITIES.REQUESTS_VIEW);
  const canReviewAopcs = hasCapability(tiers, CAPABILITIES.AOPC_REVIEW);

  const user = await localUser(session!.user.discordUserId);

  let ongoingCount = 0;
  let archivedCount = 0;
  let deadlineCount = 0;
  if (canViewCases) {
    try {
      const scope = canViewAllCases
        ? {}
        : { OR: [{ assignedAttorneyId: user?.id }, { createdById: user?.id }] };
      const soon = new Date();
      soon.setDate(soon.getDate() + 3);
      [ongoingCount, archivedCount, deadlineCount] = await Promise.all([
        prisma.case.count({ where: { archived: false, ...scope } }),
        prisma.case.count({ where: { archived: true, ...scope } }),
        prisma.case.count({
          where: {
            archived: false,
            ...scope,
            OR: [
              { discDue: { lte: soon } },
              { pretrial: { lte: soon } },
              { appealBy: { lte: soon } },
            ],
          },
        }),
      ]);
    } catch (error) {
      console.error("Failed to load case counts", error);
    }
  }

  let rosterCount = 0;
  if (canViewRoster) {
    try {
      rosterCount = await prisma.rosterEntry.count();
    } catch (error) {
      console.error("Failed to load roster count", error);
    }
  }

  let pendingRequestCount = 0;
  if (canApproveRequests) {
    try {
      pendingRequestCount = await prisma.caseActionRequest.count({ where: { status: "PENDING" } });
    } catch (error) {
      console.error("Failed to load pending request count", error);
    }
  }

  let releasesThisMonth = 0;
  if (canManageAnnouncements) {
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      releasesThisMonth = await prisma.announcement.count({
        where: { isPublished: true, publishedAt: { gte: monthStart } },
      });
    } catch (error) {
      console.error("Failed to load release count", error);
    }
  }

  let newRecordsRequests = 0;
  if (canViewRequests) {
    try {
      newRecordsRequests = await prisma.recordsRequest.count({ where: { status: "NEW" } });
    } catch (error) {
      console.error("Failed to load records request count", error);
    }
  }

  let pendingAopcs = 0;
  if (canReviewAopcs) {
    try {
      pendingAopcs = await prisma.aopc.count({ where: { status: "PENDING" } });
    } catch (error) {
      console.error("Failed to load pending affidavit count", error);
    }
  }

  return (
    <div>
      <p className="eyebrow">Staff Portal</p>
      <h1>Welcome, {session!.user.displayName}</h1>
      <p className="subtitle">
        Staff role{tiers.length === 1 ? "" : "s"}:{" "}
        {tiers.length > 0
          ? tiers.map((t) => TIER_DEFINITIONS[t].label).join(", ")
          : "No recognized staff role"}
      </p>

      <div className="cards">
        {canViewCases && (
          <>
            <Link href="/dashboard/cases?tab=ongoing" className="card">
              <span className="card-label">Ongoing Cases</span>
              <span className="card-value">{ongoingCount}</span>
            </Link>
            <Link href="/dashboard/cases?tab=archived" className="card">
              <span className="card-label">Archived Cases</span>
              <span className="card-value">{archivedCount}</span>
            </Link>
            {deadlineCount > 0 && (
              <Link href="/dashboard/cases?tab=ongoing" className="card">
                <span className="card-label">Deadlines This Week</span>
                <span className="card-value" style={{ color: "var(--down)" }}>
                  {deadlineCount}
                </span>
              </Link>
            )}
          </>
        )}
        {canApproveRequests && pendingRequestCount > 0 && (
          <Link href="/dashboard/cases/requests" className="card">
            <span className="card-label">Pending Case Requests</span>
            <span className="card-value">{pendingRequestCount}</span>
          </Link>
        )}
        {canViewRoster && (
          <Link href="/dashboard/roster" className="card">
            <span className="card-label">Roster</span>
            <span className="card-value">{rosterCount}</span>
          </Link>
        )}
        {canManageAnnouncements && (
          <Link href="/dashboard/announcements" className="card">
            <span className="card-label">Releases This Month</span>
            <span className="card-value">{releasesThisMonth}</span>
          </Link>
        )}
        {canViewRequests && newRecordsRequests > 0 && (
          <Link href="/dashboard/records-requests" className="card">
            <span className="card-label">New Records Requests</span>
            <span className="card-value">{newRecordsRequests}</span>
          </Link>
        )}
        {canReviewAopcs && pendingAopcs > 0 && (
          <Link href="/dashboard/affidavits" className="card">
            <span className="card-label">Pending Affidavits</span>
            <span className="card-value">{pendingAopcs}</span>
          </Link>
        )}
      </div>
    </div>
  );
}

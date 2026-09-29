import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TIER_DEFINITIONS, hasCapability, CAPABILITIES } from "@/lib/permissions";

export default async function DashboardOverviewPage() {
  const session = await auth();
  const tiers = session!.user.tiers;

  const canViewCases = hasCapability(tiers, CAPABILITIES.CASES_VIEW);
  const canViewRoster = hasCapability(tiers, CAPABILITIES.ROSTER_VIEW);
  const canViewBulletin = hasCapability(tiers, CAPABILITIES.BULLETIN_VIEW);
  const canManageAnnouncements = hasCapability(tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE);

  let ongoingCount = 0;
  let archivedCount = 0;
  if (canViewCases) {
    try {
      [ongoingCount, archivedCount] = await Promise.all([
        prisma.case.count({ where: { archived: false } }),
        prisma.case.count({ where: { archived: true } }),
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

  let bulletinCount = 0;
  if (canViewBulletin) {
    try {
      bulletinCount = await prisma.announcement.count({
        where: { audience: "LAW_ENFORCEMENT", isPublished: true },
      });
    } catch (error) {
      console.error("Failed to load bulletin count", error);
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
          </>
        )}
        {canViewRoster && (
          <Link href="/dashboard/roster" className="card">
            <span className="card-label">Roster</span>
            <span className="card-value">{rosterCount}</span>
          </Link>
        )}
        {canViewBulletin && (
          <Link href="/dashboard/bulletin" className="card">
            <span className="card-label">LE Bulletin Posts</span>
            <span className="card-value">{bulletinCount}</span>
          </Link>
        )}
        {canManageAnnouncements && (
          <Link href="/dashboard/announcements" className="card">
            <span className="card-label">Manage Releases</span>
            <span className="card-value" style={{ fontSize: 15 }}>
              Public &amp; LE Posts
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}

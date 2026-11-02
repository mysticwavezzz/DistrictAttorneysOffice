import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { SiteHeader, type NavItem } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RoleSyncPoller } from "@/components/role-sync-poller";
import { canViewCases } from "@/lib/case-access";
import { shareMetadata } from "@/lib/share-metadata";
import { hasActiveDeveloperProfile } from "@/lib/developer-profile-access";
import { getOnboardingAccessTiers } from "@/lib/onboarding-access";
import { prisma } from "@/lib/prisma";

export const metadata = { ...shareMetadata("Staff Portal", "Staff workspace for assigned cases, filings, deadlines, and office workflows.", "/dashboard"), robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.providerUserId) redirect("/login?callbackUrl=/dashboard");
  const [tiers, divisionRoster] = await Promise.all([
    getOnboardingAccessTiers(session.user.robloxUserId, session.user.tiers),
    session.user.robloxUserId ? prisma.rosterEntry.findUnique({ where: { robloxUserId: session.user.robloxUserId }, select: { unit: true, isActive: true } }) : null,
  ]);
  if (!hasCapability(tiers, CAPABILITIES.DASHBOARD_VIEW)) redirect("/login?error=forbidden");
  const isTrainee = tiers.includes("prosecutor_in_training");
  const orientationPending = tiers.includes("attorney_orientation_pending");
  const mayViewCases = canViewCases(tiers);
  const isCriminalDivisionStaff = divisionRoster?.isActive && divisionRoster.unit === "Criminal Division";
  const hasDeveloperProfile = await hasActiveDeveloperProfile(session.user);
  const canEditWeeklyReport = tiers.includes("district_attorney") || hasDeveloperProfile;
  const canReviewInbox = [CAPABILITIES.CASES_APPROVE_EDITS, CAPABILITIES.CASES_APPROVE_DIVISION, CAPABILITIES.REQUESTS_VIEW, CAPABILITIES.TIPS_REVIEW].some((capability) => hasCapability(tiers, capability));
  const primaryNav: NavItem[] = isTrainee ? [{ label: "Learning Course", href: "/dashboard/learning" }] : orientationPending ? [{ label: "Attorney Orientation", href: "/dashboard/orientation" }] : [
    ...(mayViewCases ? [{ label: "Work Queue", href: "/dashboard/work-queue" }, { label: "Cases", href: "/dashboard/cases" }] : [{ label: "Overview", href: "/dashboard" }]),
    ...((hasCapability(tiers, CAPABILITIES.CASES_CREATE) || hasCapability(tiers, CAPABILITIES.CASES_PROPOSE_EDIT)) ? [{ label: "Intake", href: "/dashboard/intake" }] : []),
    ...(canReviewInbox ? [{ label: "Review Inbox", href: "/dashboard/review" }] : []),
  ];
  const staffToolGroups = isTrainee || orientationPending ? [] : [
    {
      label: "Casework",
      items: [
        ...(mayViewCases ? [...((hasCapability(tiers, CAPABILITIES.CASES_ASSIGN) || hasCapability(tiers, CAPABILITIES.CASES_ASSIGN_DIVISION)) ? [{ label: "Workload & Assignment", href: "/dashboard/workload" }] : []), { label: "Filing History", href: "/dashboard/filings" }, { label: "Deadline Calendar", href: "/dashboard/cases/calendar" }] : []),
        { label: "Search", href: "/dashboard/search" },
      ],
    },
    {
      label: "Office Management",
      items: [
        ...((hasCapability(tiers, CAPABILITIES.ROSTER_VIEW) || hasCapability(tiers, CAPABILITIES.ROSTER_VIEW_DIVISION)) ? [{ label: "Staff Roster", href: "/dashboard/roster" }] : []),
        ...(hasCapability(tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE) ? [{ label: "Public Releases", href: "/dashboard/announcements" }] : []),
        ...(hasCapability(tiers, CAPABILITIES.ACTIVITY_VIEW) ? [{ label: "Activity Log", href: "/dashboard/activity" }] : []),
        ...((hasCapability(tiers, CAPABILITIES.CASES_VIEW_ALL) || hasCapability(tiers, CAPABILITIES.CASES_VIEW_DIVISION)) ? [{ label: "Supervisor Reports", href: "/dashboard/reports" }] : []),
        ...(canEditWeeklyReport ? [{ label: "Weekly Report Figures", href: "/dashboard/weekly-report" }] : []),
      ],
    },
    {
      label: "Training & Documents",
      items: [
        ...(mayViewCases && isCriminalDivisionStaff ? [{ label: "Criminal Division Orientation", href: "/dashboard/orientation" }] : []),
        ...(hasDeveloperProfile ? [{ label: "Document Creator", href: "/dashboard/templates" }] : []),
      ],
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="wrap">
      <a href="#main" className="skiplink">Skip to main content</a>
      <SiteHeader staffNav={primaryNav} staffToolGroups={staffToolGroups} />
      <div className="body staff-body">
        <main className="paper" id="main">{children}</main>
      </div>
      <SiteFooter />
      {!isTrainee && !orientationPending && <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
        <RoleSyncPoller />
      </SessionProvider>}
    </div>
  );
}

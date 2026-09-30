import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { SiteHeader, type NavItem } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RoleSyncPoller } from "@/components/role-sync-poller";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.providerUserId) redirect("/login?callbackUrl=/dashboard");
  if (!hasCapability(session.user.tiers, CAPABILITIES.DASHBOARD_VIEW)) redirect("/login?error=forbidden");

  const tiers = session.user.tiers;
  const canViewCases = hasCapability(tiers, CAPABILITIES.CASES_VIEW);
  const primaryNav: NavItem[] = [
    { label: "Overview", href: "/dashboard" },
    ...(canViewCases ? [
      { label: "My Cases", href: "/dashboard/cases" },
      { label: "Filing History", href: "/dashboard/filings" },
    ] : []),
  ];
  const staffTools: NavItem[] = [
    ...(canViewCases ? [{ label: "Deadline Calendar", href: "/dashboard/cases/calendar" }] : []),
    ...(hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS) ? [{ label: "Case Review Queue", href: "/dashboard/cases/requests" }] : []),
    ...(hasCapability(tiers, CAPABILITIES.REQUESTS_VIEW) ? [{ label: "Records Requests", href: "/dashboard/records-requests" }] : []),
    ...(hasCapability(tiers, CAPABILITIES.ROSTER_VIEW) ? [{ label: "Staff Roster", href: "/dashboard/roster" }] : []),
    ...(hasCapability(tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE) ? [{ label: "Public Releases", href: "/dashboard/announcements" }] : []),
    ...(hasCapability(tiers, CAPABILITIES.ACTIVITY_VIEW) ? [{ label: "Activity Log", href: "/dashboard/activity" }] : []),
    { label: "Search", href: "/dashboard/search" },
  ];

  return (
    <div className="wrap">
      <a href="#main" className="skiplink">Skip to main content</a>
      <SiteHeader staffNav={primaryNav} staffTools={staffTools} />
      <div className="body staff-body">
        <main className="paper" id="main">{children}</main>
      </div>
      <SiteFooter />
      <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
        <RoleSyncPoller />
      </SessionProvider>
    </div>
  );
}

import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { SiteHeader, type NavItem } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RoleSyncPoller } from "@/components/role-sync-poller";
import { StaffNavGroups } from "@/components/staff-nav-groups";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.providerUserId) {
    redirect("/login?callbackUrl=/dashboard");
  }

  if (!hasCapability(session.user.tiers, CAPABILITIES.DASHBOARD_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const tiers = session.user.tiers;
  const navGroups = [
    { label: "Workspace", items: [{ label: "Overview", href: "/dashboard", show: true }, { label: "My Work", href: "/dashboard/cases?mine=1", show: hasCapability(tiers, CAPABILITIES.CASES_VIEW) }, { label: "Notifications", href: "/settings#notifications", show: true }] },
    { label: "Casework", items: [{ label: "Cases", href: "/dashboard/cases", show: hasCapability(tiers, CAPABILITIES.CASES_VIEW) }, { label: "Deadline Calendar", href: "/dashboard/cases/calendar", show: hasCapability(tiers, CAPABILITIES.CASES_VIEW) }, { label: "Case Requests", href: "/dashboard/cases/requests", show: hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS) }] },
    { label: "Submissions", items: [{ label: "AOPCs", href: "/dashboard/affidavits", show: hasCapability(tiers, CAPABILITIES.AOPC_SUBMIT) || hasCapability(tiers, CAPABILITIES.AOPC_REVIEW) }, { label: "Records Requests", href: "/dashboard/records-requests", show: hasCapability(tiers, CAPABILITIES.REQUESTS_VIEW) }] },
    { label: "Administration", items: [{ label: "Staff Roster", href: "/dashboard/roster", show: hasCapability(tiers, CAPABILITIES.ROSTER_VIEW) }, { label: "Public Releases", href: "/dashboard/announcements", show: hasCapability(tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE) }, { label: "Activity Log", href: "/dashboard/activity", show: hasCapability(tiers, CAPABILITIES.ACTIVITY_VIEW) }, { label: "Search", href: "/dashboard/search", show: true }] },
  ].map((group) => ({ ...group, items: group.items.filter((item) => item.show) })).filter((group) => group.items.length);
  const staffNav = navGroups.flatMap((group) => group.items);

  return (
    <div className="wrap">
      <a href="#main" className="skiplink">
        Skip to main content
      </a>

      <SiteHeader staffNav={staffNav} />

      <div className="body">
        <aside className="side">
          <div className="sbox">
            <h3>Staff Portal</h3>
            <StaffNavGroups groups={navGroups} />
          </div>
        </aside>

        <main className="paper" id="main">
          {children}
        </main>
      </div>

      <SiteFooter />

      <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
        <RoleSyncPoller />
      </SessionProvider>
    </div>
  );
}

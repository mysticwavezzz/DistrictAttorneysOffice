import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { SiteHeader, type NavItem } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.discordUserId) {
    redirect("/login?callbackUrl=/dashboard");
  }

  if (!hasCapability(session.user.tiers, CAPABILITIES.DASHBOARD_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const tiers = session.user.tiers;
  const sections: (NavItem & { show: boolean })[] = [
    { label: "Overview", href: "/dashboard", show: true },
    { label: "Cases", href: "/dashboard/cases", show: hasCapability(tiers, CAPABILITIES.CASES_VIEW) },
    { label: "Roster", href: "/dashboard/roster", show: hasCapability(tiers, CAPABILITIES.ROSTER_VIEW) },
    {
      label: "LE Bulletin",
      href: "/dashboard/bulletin",
      show: hasCapability(tiers, CAPABILITIES.BULLETIN_VIEW),
    },
    {
      label: "Public Releases",
      href: "/dashboard/announcements",
      show: hasCapability(tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE),
    },
  ];
  const staffNav = sections.filter((s) => s.show);

  const pathname = headers().get("x-pathname") ?? "/dashboard";
  const active =
    staffNav
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "/dashboard";

  return (
    <div className="wrap">
      <a href="#main" className="skiplink">
        Skip to main content
      </a>

      <SiteHeader staffNav={staffNav} activeHref={active} />

      <div className="body">
        <aside className="side">
          <div className="sbox">
            <h3>Staff Portal</h3>
            <ul>
              {staffNav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="paper" id="main">
          {children}
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

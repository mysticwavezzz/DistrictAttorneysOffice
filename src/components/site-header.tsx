import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { Seal } from "./seal";
import { TextSizeToggle } from "./text-size-toggle";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
}

interface SiteHeaderProps {
  staffNav?: NavItem[];
  activeHref?: string;
}

export async function SiteHeader({ staffNav, activeHref }: SiteHeaderProps = {}) {
  const session = await auth();
  const isStaff = Boolean(session?.user?.discordUserId);
  const canViewDashboard =
    isStaff && hasCapability(session!.user.tiers, CAPABILITIES.DASHBOARD_VIEW);

  const navItems = staffNav ?? siteConfig.nav;
  const active = activeHref ?? navItems[0]?.href;

  return (
    <>
      <div className="util">
        <div className="util-in">
          <div>
            {siteConfig.county} {siteConfig.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <TextSizeToggle />
            <ThemeToggle />
            {staffNav ? (
              <>
                <NotificationBell />
                <span>{session!.user.displayName}</span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <button type="submit" className="linklike">
                    Sign Out
                  </button>
                </form>
              </>
            ) : canViewDashboard ? (
              <Link href="/dashboard">Staff Dashboard</Link>
            ) : (
              <Link href="/login">Staff Login</Link>
            )}
          </div>
        </div>
      </div>

      <div className="masthead">
        <div className="seal">
          <Seal />
        </div>
        <div className="lockup">
          <span className="lockup-top">{siteConfig.county}</span>
          <span className="lockup-mid">
            {staffNav ? "Staff Portal" : "Office of the District Attorney"}
          </span>
          <span className="lockup-main">{siteConfig.name}</span>
        </div>
        <div className="mast-est">
          Established 1869
          <br />
          Criminal Division
        </div>
      </div>

      <div className="flagrule" />

      <nav className="nav" aria-label="Primary">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={item.href === active ? "on" : undefined}>
            {item.label}
          </Link>
        ))}
        <div className="nav-group">
          {staffNav ? (
            <Link href="/">Public Site</Link>
          ) : (
            <>
              <span className="nav-group-label">Staff</span>
              {canViewDashboard ? (
                <Link href="/dashboard">Dashboard</Link>
              ) : (
                <Link href="/login">Sign In</Link>
              )}
            </>
          )}
        </div>
      </nav>
    </>
  );
}

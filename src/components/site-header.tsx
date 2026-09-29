import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { Seal } from "./seal";
import { TextSizeToggle } from "./text-size-toggle";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { NavTabsScroller } from "./nav-tabs-scroller";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
}

interface SiteHeaderProps {
  staffNav?: NavItem[];
}

export async function SiteHeader({ staffNav }: SiteHeaderProps = {}) {
  const session = await auth();
  const isStaff = Boolean(session?.user?.discordUserId);
  const canViewDashboard =
    isStaff && hasCapability(session!.user.tiers, CAPABILITIES.DASHBOARD_VIEW);
  const canViewBulletin = isStaff && hasCapability(session!.user.tiers, CAPABILITIES.BULLETIN_VIEW);

  const navItems =
    staffNav ??
    (canViewBulletin ? [...siteConfig.nav, { label: "LE Bulletin", href: "/bulletin" }] : siteConfig.nav);

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
            {isStaff ? (
              <>
                {!staffNav && canViewDashboard && <Link href="/dashboard">Staff Dashboard</Link>}
                <span>{session!.user.displayName}</span>
                <NotificationBell />
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
        <NavTabsScroller items={navItems} />
        {!staffNav && (!isStaff || canViewDashboard) && (
          <div className="nav-group">
            <span className="nav-group-label">Staff</span>
            {canViewDashboard ? (
              <Link href="/dashboard">Dashboard</Link>
            ) : (
              <Link href="/login">Sign In</Link>
            )}
          </div>
        )}
      </nav>

      <div className="crumb">
        <div className="crumb-in">
          <Link href="/">&larr; Home</Link>
        </div>
      </div>
    </>
  );
}

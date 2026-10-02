import Link from "next/link";
import { auth } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { Seal } from "./seal";
import { TextSizeToggle } from "./text-size-toggle";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { NavTabsScroller } from "./nav-tabs-scroller";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { SessionProvider } from "next-auth/react";
import { ProfileMenu } from "./profile-menu";
import { isDeveloperProfileIdentity } from "@/config/developer-profiles";
import { prisma } from "@/lib/prisma";

export interface NavItem {
  label: string;
  href: string;
}

interface SiteHeaderProps {
  staffNav?: NavItem[];
  staffTools?: NavItem[];
}

export async function SiteHeader({ staffNav, staffTools = [] }: SiteHeaderProps = {}) {
  const session = await auth();
  const isStaff = Boolean(session?.user?.providerUserId);
  const linkedDiscordUserId = session?.user?.robloxUserId
    ? (await prisma.user.findUnique({ where: { robloxUserId: session.user.robloxUserId }, select: { discordUserId: true } }))?.discordUserId ?? null
    : null;
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
                <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
                  <ProfileMenu displayName={session!.user.displayName} username={session!.user.username} identityProvider={session!.user.identityProvider} providerUserId={session!.user.providerUserId} avatarUrl={session!.user.avatarUrl} initialTiers={session!.user.tiers} canToggleDeveloperProfile={isDeveloperProfileIdentity(session!.user.identityProvider, session!.user.username)} linkedDiscordUserId={linkedDiscordUserId} />
                </SessionProvider>
                <NotificationBell />
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

      <nav className="nav" aria-label={staffNav ? "Staff navigation" : "Primary"}>
        <NavTabsScroller items={navItems} />
        {staffNav ? (
          <details className="staff-tools-menu">
            <summary>More</summary>
            <div className="staff-tools-panel">{staffTools.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</div>
          </details>
        ) : (!isStaff || canViewDashboard) && (
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

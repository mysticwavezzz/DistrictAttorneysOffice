import Link from "next/link";
import { auth } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { Seal } from "./seal";
import { TextSizeToggle } from "./text-size-toggle";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";

export async function SiteHeader() {
  const session = await auth();
  const isStaff = Boolean(session?.user?.discordUserId);
  const canViewDashboard =
    isStaff && hasCapability(session!.user.tiers, CAPABILITIES.DASHBOARD_VIEW);

  return (
    <>
      <div className="util">
        <div className="util-in">
          <div>
            {siteConfig.county} {siteConfig.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <TextSizeToggle />
            {canViewDashboard ? (
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
          <span className="lockup-mid">Office of the District Attorney</span>
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
        {siteConfig.nav.map((item, index) => (
          <Link key={item.href} href={item.href} className={index === 0 ? "on" : undefined}>
            {item.label}
          </Link>
        ))}
        <div className="nav-group">
          <span className="nav-group-label">Staff</span>
          {canViewDashboard ? (
            <Link href="/dashboard">Dashboard</Link>
          ) : (
            <Link href="/login">Sign In</Link>
          )}
        </div>
      </nav>
    </>
  );
}

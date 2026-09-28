import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { Seal } from "@/components/seal";
import { siteConfig } from "@/config/site";

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

  return (
    <div className="dash-shell">
      <header className="dash-topbar">
        <div className="dash-topbar-in">
          <Link href="/dashboard" className="dash-title">
            <span className="seal seal-sm" style={{ color: "#fff" }}>
              <Seal />
            </span>
            {siteConfig.name} — Staff Portal
          </Link>
          <div className="dash-user">
            <span>{session.user.displayName}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className="govbtn-outline">
                Sign Out
              </button>
            </form>
          </div>
        </div>
        <nav className="dash-tabs" aria-label="Staff portal">
          <Link href="/dashboard">Overview</Link>
          <Link href="/dashboard/cases">Cases</Link>
        </nav>
      </header>
      <main className="dash-main">{children}</main>
    </div>
  );
}

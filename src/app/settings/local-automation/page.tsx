import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser, canAssignCase } from "@/lib/case-access";
import { LocalAutomationSettings } from "@/components/local-automation-settings";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { hasActiveDeveloperProfile } from "@/lib/developer-profile-access";

export const metadata = staffPageMetadata("Local Case Operations", "Manage signed local access for case lookup and assignment.", "/settings/local-automation");

export default async function LocalAutomationPage() {
  const session = await auth();
  if (!session?.user?.providerUserId || session.user.identityProvider !== "roblox") redirect("/login?callbackUrl=/settings/local-automation");
  if (!await hasActiveDeveloperProfile(session.user)) redirect("/settings?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const activeToken = await prisma.localAutomationToken.findFirst({
    where: { activeForUserId: user.id },
    select: { id: true, name: true, tokenPrefix: true, createdAt: true, expiresAt: true, lastUsedAt: true },
  });

  return <div className="wrap">
    <a href="#main" className="skiplink">Skip to main content</a><SiteHeader />
    <div className="body"><Sidebar />
      <main className="paper" id="main">
        <p className="eyebrow">Your account</p><h1>Local case operations</h1>
        <p className="lede">Run case lookups and attorney assignments from PowerShell without operating the portal by hand.</p>
        <p><Link href="/settings">Back to settings</Link></p>
        <LocalAutomationSettings
          canCreate={canAssignCase(session.user.tiers, user.division)}
          activeToken={activeToken ? {
            ...activeToken,
            createdAt: activeToken.createdAt.toISOString(),
            expiresAt: activeToken.expiresAt.toISOString(),
            lastUsedAt: activeToken.lastUsedAt?.toISOString() ?? null,
          } : null}
        />
      </main>
    </div><SiteFooter />
  </div>;
}

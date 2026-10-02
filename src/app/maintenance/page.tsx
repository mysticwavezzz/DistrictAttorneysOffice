import { siteConfig } from "@/config/site";
import { getSiteSettings } from "@/lib/site-settings";
import { Seal } from "@/components/seal";
import { getWebsiteVersion } from "@/lib/site-version";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { getSiteConfiguration } from "@/lib/site-settings";

export default async function MaintenancePage() {
  const settings = await getSiteSettings();
  const version = await getWebsiteVersion();
  const [session, exemptTiers, exemptUserIds] = await Promise.all([
    auth(),
    getSiteConfiguration<string[]>("maintenanceExemptTiers", []),
    getSiteConfiguration<string[]>("maintenanceExemptDiscordUserIds", []),
  ]);
  const user = session?.user;
  const accountId = user?.providerUserId ?? user?.robloxUserId ?? user?.discordUserId;
  const maintenanceExempt = Boolean(accountId && exemptUserIds.includes(accountId)) || Boolean(user?.tiers?.some((tier) => exemptTiers.includes(tier)));
  const canManageSite = Boolean(user && hasCapability(user.tiers, CAPABILITIES.SETTINGS_MANAGE));

  return (
    <div className="wrap">
      <main className="paper" style={{ textAlign: "center", padding: "48px 18px" }}>
        <div style={{ width: 90, margin: "0 auto 18px" }}>
          <Seal />
        </div>
        <h1>Site Temporarily Unavailable</h1>
        <p className="lede" style={{ maxWidth: 480, margin: "0 auto" }}>
          {settings.maintenanceMessage ||
            `The ${siteConfig.name} website is currently offline for maintenance. Please check back shortly.`}
        </p>
        {settings.maintenanceEstimatedAt && (
          <p className="maintenance-meta">
            Estimated return: {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(settings.maintenanceEstimatedAt)} ET
          </p>
        )}
        {settings.updatedAt && (
          <p className="maintenance-meta">
            Last updated: {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(settings.updatedAt)} ET
          </p>
        )}
        <p className="maintenance-meta">Website version: {version}</p>
        {user && !maintenanceExempt && user.tiers.length > 0 && <p className="message message-error" role="alert">While you may be an employee or law enforcement, currently the website is restricted to your roles for maintenance.</p>}
        {!user ? <Link className="maintenance-login" href="/login?callbackUrl=%2F98981">Login</Link> : maintenanceExempt && canManageSite ? <Link className="maintenance-login" href="/98981">Admin login</Link> : null}
      </main>
    </div>
  );
}

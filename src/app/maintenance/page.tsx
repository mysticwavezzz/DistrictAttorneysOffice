import { siteConfig } from "@/config/site";
import { getSiteSettings } from "@/lib/site-settings";
import { Seal } from "@/components/seal";
import { getWebsiteVersion } from "@/lib/site-version";

export default async function MaintenancePage() {
  const settings = await getSiteSettings();
  const version = await getWebsiteVersion();

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
      </main>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { TIER_DEFINITIONS } from "@/lib/permissions/tiers";
import { DISCORD_TIER_ROLE_MAPPINGS } from "@/config/discord-role-mappings";
import { UNITS, AOPC_TARGET_UNITS, UNIT_LEADER_RANK } from "@/config/units";
import { getSiteSettings } from "@/lib/site-settings";
import { env } from "@/lib/env";
import { FormWithPendingSubmit } from "@/components/form-with-pending-submit";
import { ClearDataForm } from "./clear-data-form";
import { updateMaintenanceSettings, updateNotificationSettings } from "./actions";

export default async function SiteSettingsPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) {
    redirect("/login?error=forbidden");
  }

  const settings = await getSiteSettings();

  return (
    <div className="wrap">
      <a href="#main" className="skiplink">
        Skip to main content
      </a>

      <div className="util">
        <div className="util-in">
          <div>Site Settings</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span>{session.user.displayName}</span>
            <Link href="/dashboard">Dashboard</Link>
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
          </div>
        </div>
      </div>

      <main className="paper" id="main" style={{ maxWidth: 900, margin: "0 auto" }}>
      <p className="eyebrow">Hidden Control Panel</p>
      <h1>Site Settings</h1>
      <p className="lede">
        This page is not linked from anywhere in the site and is only reachable by URL. It
        controls site-wide behavior, not any single user&apos;s account.
      </p>

      <h2>Maintenance Mode</h2>
      <p className="note-inline">
        {settings.maintenanceMode
          ? "Currently ON — every page except this one and Staff Login shows a maintenance notice."
          : "Currently OFF — the site is live."}
      </p>
      <FormWithPendingSubmit
        action={updateMaintenanceSettings}
        submitLabel="Save Maintenance Settings"
        pendingLabel="Saving…"
        className="formbox"
      >
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}>
            <input type="checkbox" name="maintenanceMode" defaultChecked={settings.maintenanceMode} />
            Take the site offline for maintenance
          </label>
        </div>
        <div className="field">
          <label htmlFor="maintenanceMessage">
            Message shown to visitors <span className="hint">(optional)</span>
          </label>
          <textarea
            id="maintenanceMessage"
            name="maintenanceMessage"
            rows={2}
            maxLength={500}
            defaultValue={settings.maintenanceMessage ?? ""}
            placeholder="The site is currently offline for maintenance. Please check back shortly."
          />
        </div>
      </FormWithPendingSubmit>

      <h2>Notifications</h2>
      <p className="note-inline">
        {settings.notificationsDisabled
          ? "Currently OFF — no in-site or Discord DM notifications are being sent to anyone."
          : "Currently ON — notifications send normally."}
      </p>
      <FormWithPendingSubmit
        action={updateNotificationSettings}
        submitLabel="Save Notification Settings"
        pendingLabel="Saving…"
        className="formbox"
      >
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}>
            <input
              type="checkbox"
              name="notificationsDisabled"
              defaultChecked={settings.notificationsDisabled}
            />
            Disable notifications for everyone
          </label>
        </div>
      </FormWithPendingSubmit>

      <h2>System Status</h2>
      <div className="tablewrap">
        <table className="stat">
          <tbody>
            <tr>
              <th>Environment</th>
              <td>{env.NODE_ENV}</td>
            </tr>
            <tr>
              <th>Discord sign-in</th>
              <td>
                <span className="pill pill-green">Configured</span> — the app would not start
                without a client ID, secret, bot token, and guild ID.
              </td>
            </tr>
            <tr>
              <th>Discord DM notifications</th>
              <td>
                <span className={`pill ${env.DISCORD_DM_NOTIFICATIONS ? "pill-green" : "pill-muted"}`}>
                  {env.DISCORD_DM_NOTIFICATIONS ? "Enabled" : "Disabled"}
                </span>
              </td>
            </tr>
            <tr>
              <th>Criminal tip line (Google Form)</th>
              <td>
                <span className={`pill ${env.GOOGLE_FORM_ACTION_URL ? "pill-green" : "pill-gold"}`}>
                  {env.GOOGLE_FORM_ACTION_URL ? "Configured" : "Not configured"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Permission Tiers &amp; Discord Roles</h2>
      <p className="note-inline">
        Read-only — who gets a tier and what it can do is defined in code and needs a deploy to
        change.
      </p>
      <div className="tablewrap">
        <table className="stat">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Grants</th>
              <th>Discord Role IDs</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(TIER_DEFINITIONS).map((tier) => {
              const mapping = DISCORD_TIER_ROLE_MAPPINGS.find((m) => m.tier === tier.id);
              return (
                <tr key={tier.id}>
                  <th>
                    {tier.label}
                    <div className="note-inline" style={{ fontWeight: "normal" }}>
                      {tier.description}
                    </div>
                  </th>
                  <td style={{ fontSize: 11 }}>{tier.capabilities.join(", ")}</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {mapping && mapping.roleIds.length > 0 ? (
                      mapping.roleIds.join(", ")
                    ) : (
                      <span className="pill pill-red">No role IDs set</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Affidavit of Probable Cause Routing</h2>
      <p className="note-inline">Read-only — which units exist and where affidavits can be sent.</p>
      <div className="tablewrap">
        <table className="stat">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Accepts Affidavit Referrals</th>
              <th>Leader Rank</th>
            </tr>
          </thead>
          <tbody>
            {UNITS.map((unit) => (
              <tr key={unit.value}>
                <th>{unit.label}</th>
                <td>
                  {AOPC_TARGET_UNITS.includes(unit.value) ? (
                    <span className="pill pill-green">Yes</span>
                  ) : (
                    <span className="pill pill-muted">No</span>
                  )}
                </td>
                <td style={{ fontSize: 11 }}>{UNIT_LEADER_RANK[unit.value] ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ color: "var(--down)" }}>Danger Zone</h2>
      <div className="formbox" style={{ borderColor: "#6b2018" }}>
        <p className="note-inline">
          Permanently deletes every case (and its filings, comments, and edit requests),
          affidavit of probable cause, public release, records request, notification, and
          activity log entry. This does <strong>not</strong> delete staff accounts or the staff
          roster. This cannot be undone.
        </p>
        <ClearDataForm />
      </div>
      </main>
    </div>
  );
}

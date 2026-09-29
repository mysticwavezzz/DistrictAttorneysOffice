import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { hasCapability } from "@/lib/permissions";
import { TIER_DEFINITIONS, ALL_TIERS } from "@/lib/permissions/tiers";
import { CAPABILITIES } from "@/lib/permissions/capabilities";
import { DISCORD_TIER_ROLE_MAPPINGS } from "@/config/discord-role-mappings";
import { UNITS } from "@/config/units";
import { getSiteSettings } from "@/lib/site-settings";
import { env } from "@/lib/env";
import { FormWithPendingSubmit } from "@/components/form-with-pending-submit";
import { ClearDataForm } from "./clear-data-form";
import { updateMaintenanceSettings, updateNotificationSettings, saveApplicationConfiguration, saveConfigurationBackup, restoreConfigurationBackup } from "./actions";
import { RANKS } from "@/config/ranks";
import { CASE_STATUSES } from "@/config/case-statuses";
import { getSiteConfiguration } from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";
import { CRIME_TIP_FORM } from "@/config/crime-tip-form";

export default async function SiteSettingsPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) {
    redirect("/login?error=forbidden");
  }

  const settings = await getSiteSettings();
  const [roleMappings, configuredCapabilities, divisions, ranks, caseStatuses] = await Promise.all([
    getSiteConfiguration("discordRoleMappings", DISCORD_TIER_ROLE_MAPPINGS),
    getSiteConfiguration<Record<string, string[]>>(
      "tierCapabilities",
      Object.fromEntries(Object.values(TIER_DEFINITIONS).map((tier) => [tier.id, tier.capabilities]))
    ),
    getSiteConfiguration("divisions", UNITS),
    getSiteConfiguration("ranks", RANKS),
    getSiteConfiguration("caseStatuses", CASE_STATUSES),
  ]);
  const [tipConfiguration, backups, auditLogs] = await Promise.all([
    getSiteConfiguration("crimeTipForm", null),
    prisma.configurationBackup.findMany({ orderBy: { createdAt: "desc" }, take: 10 }).catch(() => []),
    prisma.settingsAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }).catch(() => []),
  ]);

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
        <div className="field">
          <label htmlFor="maintenanceEstimatedAt">Estimated return time <span className="hint">(optional)</span></label>
          <input
            id="maintenanceEstimatedAt"
            name="maintenanceEstimatedAt"
            type="datetime-local"
            defaultValue={settings.maintenanceEstimatedAt
              ? new Date(settings.maintenanceEstimatedAt.getTime() - settings.maintenanceEstimatedAt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
              : ""}
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
        <div className="field"><label htmlFor="deadlineReminderDays">Upcoming deadline reminders (days before, comma-separated)</label><input id="deadlineReminderDays" name="deadlineReminderDays" defaultValue={settings.deadlineReminderDays} placeholder="7,3,1" /></div>
        <div className="field"><label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}><input type="checkbox" name="overdueRemindersEnabled" defaultChecked={settings.overdueRemindersEnabled}/> Send reminders for overdue deadlines</label></div>
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
                <span className={`pill ${tipConfiguration ? "pill-green" : "pill-gold"}`}>
                  {tipConfiguration ? "Configured" : "Using built-in form configuration"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Permission Tiers &amp; Discord Roles</h2>
      <p className="note-inline">Update role IDs, access grants, divisions, ranks and case status options below. Credentials and hosting settings remain in Railway.</p>
      <FormWithPendingSubmit action={saveApplicationConfiguration} submitLabel="Save Application Configuration" pendingLabel="Saving…" className="formbox">
        <h3>Discord role to permission tier mappings</h3>
        <p className="note-inline">Each Discord role ID must be numeric. Each recognized role grants its tier.</p>
        <div className="field"><label htmlFor="discordRoleMappings">Role mappings (JSON)</label><textarea id="discordRoleMappings" name="discordRoleMappings" rows={10} defaultValue={JSON.stringify(roleMappings, null, 2)} spellCheck={false} /></div>
        <h3>Capabilities granted by tier</h3>
        <p className="note-inline">Available capabilities: {Object.values(CAPABILITIES).join(", ")}. Retain site settings access on at least one tier.</p>
        <div className="field"><label htmlFor="tierCapabilities">Tier permissions (JSON)</label><textarea id="tierCapabilities" name="tierCapabilities" rows={16} defaultValue={JSON.stringify(configuredCapabilities, null, 2)} spellCheck={false} /></div>
        <h3>Divisions</h3>
        <div className="field"><label htmlFor="divisions">Divisions (JSON)</label><textarea id="divisions" name="divisions" rows={12} defaultValue={JSON.stringify(divisions, null, 2)} spellCheck={false} /></div>
        <h3>Ranks</h3>
        <div className="field"><label htmlFor="ranks">Ranks (JSON)</label><textarea id="ranks" name="ranks" rows={12} defaultValue={JSON.stringify(ranks, null, 2)} spellCheck={false} /></div>
        <h3>Case status options</h3>
        <div className="field"><label htmlFor="caseStatuses">Case statuses (JSON)</label><textarea id="caseStatuses" name="caseStatuses" rows={14} defaultValue={JSON.stringify(caseStatuses, null, 2)} spellCheck={false} /></div>
        <h3>Crime tip Google Forms mapping</h3>
        <p className="note-inline">Updates the public report form destination and Google field IDs; it never submits a test response.</p>
        <div className="field"><label htmlFor="crimeTipForm">Google Forms configuration (JSON)</label><textarea id="crimeTipForm" name="crimeTipForm" rows={14} defaultValue={JSON.stringify(tipConfiguration ?? CRIME_TIP_FORM, null, 2)} spellCheck={false}/></div>
      </FormWithPendingSubmit>
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
              const mapping = roleMappings.find((m) => m.tier === tier.id);
              return (
                <tr key={tier.id}>
                  <th>
                    {tier.label}
                    <div className="note-inline" style={{ fontWeight: "normal" }}>
                      {tier.description}
                    </div>
                  </th>
                  <td style={{ fontSize: 11 }}>{(configuredCapabilities[tier.id] ?? tier.capabilities).join(", ")}</td>
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

      <h2>Configuration Backups</h2>
      <p className="note-inline">Automatic snapshots are created before settings changes and restores. These cover application settings only, not cases or the SQLite database.</p>
      <form action={saveConfigurationBackup}><button className="govbtn-outline" type="submit">Create backup now</button></form>
      {backups.length > 0 && <FormWithPendingSubmit action={restoreConfigurationBackup} submitLabel="Restore selected configuration" pendingLabel="Restoring…" className="formbox"><div className="field"><label htmlFor="backupId">Backup</label><select id="backupId" name="backupId" required defaultValue=""><option value="" disabled>Select a backup</option>{backups.map((backup)=><option key={backup.id} value={backup.id}>{backup.createdAt.toLocaleString()} — {backup.actorName}</option>)}</select></div><p className="note-inline">Restoring replaces current settings. A safety backup is created first.</p></FormWithPendingSubmit>}
      <h2>Settings Audit Trail</h2>
      <div className="tablewrap"><table className="stat"><thead><tr><th>When</th><th>Who</th><th>Change</th><th>Details</th></tr></thead><tbody>{auditLogs.length ? auditLogs.map((entry)=><tr key={entry.id}><td>{entry.createdAt.toLocaleString()}</td><td>{entry.actorName}</td><td>{entry.action}</td><td>{entry.details}</td></tr>) : <tr><td colSpan={4}>No settings changes recorded yet.</td></tr>}</tbody></table></div>
      <p><Link href="/98981/status">Open integration health and access diagnostics →</Link></p>

      <h2>Affidavit of Probable Cause Routing</h2>
      <p className="note-inline">Affidavit target units are defined in the configured divisions.</p>
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
            {divisions.map((unit) => (
              <tr key={unit.value}>
                <th>{unit.label}</th>
                <td>
                  {unit.acceptsAopc ? (
                    <span className="pill pill-green">Yes</span>
                  ) : (
                    <span className="pill pill-muted">No</span>
                  )}
                </td>
                <td style={{ fontSize: 11 }}>{unit.leaderRank ?? "—"}</td>
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

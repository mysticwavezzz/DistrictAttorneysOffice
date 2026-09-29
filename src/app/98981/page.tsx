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
import { updateMaintenanceSettings, updateWebsiteVersion, updateNotificationSettings, saveApplicationConfiguration, saveConfigurationBackup, restoreConfigurationBackup, addCrimeTipBlacklistEntry, removeCrimeTipBlacklistEntry } from "./actions";
import { RANKS } from "@/config/ranks";
import { CASE_STATUSES } from "@/config/case-statuses";
import { getSiteConfiguration } from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";
import { CRIME_TIP_FORM } from "@/config/crime-tip-form";
import { getWebsiteVersion } from "@/lib/site-version";
import { formatDateTimeInTimeZone } from "@/lib/time-zone";

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
  const [tipConfiguration, backups, auditLogs, tipBlacklist, maintenanceExemptTiers, maintenanceExemptUserIds, websiteVersionOverride, websiteVersion] = await Promise.all([
    getSiteConfiguration("crimeTipForm", null),
    prisma.configurationBackup.findMany({ orderBy: { createdAt: "desc" }, take: 10 }).catch(() => []),
    prisma.settingsAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }).catch(() => []),
    prisma.crimeTipBlacklist.findMany({ orderBy: { createdAt: "desc" } }).catch(() => []),
    getSiteConfiguration<string[]>("maintenanceExemptTiers", []),
    getSiteConfiguration<string[]>("maintenanceExemptDiscordUserIds", []),
    getSiteConfiguration<string>("websiteVersion", ""),
    getWebsiteVersion(),
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
          ? "Currently ON. Visitors are redirected to the maintenance page. This admin database remains available."
          : "Currently OFF. The site is live."}
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
          <label htmlFor="maintenanceEstimatedAt">Estimated return time <span className="hint">(optional, Eastern Time)</span></label>
          <input
            id="maintenanceEstimatedAt"
            name="maintenanceEstimatedAt"
            type="datetime-local"
            defaultValue={settings.maintenanceEstimatedAt ? formatDateTimeInTimeZone(settings.maintenanceEstimatedAt, "America/New_York") : ""}
          />
        </div>
        <h3>Maintenance Exemptions</h3>
        <p className="note-inline">Selected permission tiers (as granted through Discord role mappings) and individual Discord accounts can continue using the site while maintenance mode is on. The admin database sign-in flow remains available. Enter Discord user IDs (not usernames), separated by commas or new lines.</p>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Exempt permission tiers</legend>
          <div className="cards">{Object.values(TIER_DEFINITIONS).map((tier) => <label key={tier.id} style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none" }}><input type="checkbox" name="maintenanceExemptTiers" value={tier.id} defaultChecked={maintenanceExemptTiers.includes(tier.id)}/>{tier.label}</label>)}</div>
        </fieldset>
        <div className="field"><label htmlFor="maintenanceExemptDiscordUserIds">Exempt Discord user IDs</label><textarea id="maintenanceExemptDiscordUserIds" name="maintenanceExemptDiscordUserIds" rows={3} maxLength={2600} defaultValue={maintenanceExemptUserIds.join("\n")} placeholder="123456789012345678" /></div>
      </FormWithPendingSubmit>

      <h2>Website Version</h2>
      <p className="note-inline">Current version: <strong>{websiteVersion}</strong>. Each Git commit automatically increments the patch number by default. For medium or major releases, set <code>VERSION_BUMP=medium</code> or <code>VERSION_BUMP=major</code> before committing. A manual value overrides the automatic version; clear it to return to automatic versioning.</p>
      <form action={updateWebsiteVersion} className="formbox">
        <div className="field"><label htmlFor="websiteVersion">Manual version override <span className="hint">(blank uses the automatic version)</span></label><input id="websiteVersion" name="websiteVersion" inputMode="numeric" pattern="[0-9]+\.[0-9]+\.[0-9]+" defaultValue={websiteVersionOverride} placeholder="0.1.3" /></div>
        <button type="submit" className="govbtn">Save Website Version</button>
      </form>

      <h2>Notifications</h2>
      <p className="note-inline">
        {settings.notificationsDisabled
          ? "Currently OFF. No in-site or Discord DM notifications are being sent."
          : "Currently ON. Notifications are sending normally."}
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
                <span className="pill pill-green">Configured</span>. The app would not start
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
      {backups.length > 0 && <FormWithPendingSubmit action={restoreConfigurationBackup} submitLabel="Restore selected configuration" pendingLabel="Restoring..." className="formbox"><div className="field"><label htmlFor="backupId">Backup</label><select id="backupId" name="backupId" required defaultValue=""><option value="" disabled>Select a backup</option>{backups.map((backup)=><option key={backup.id} value={backup.id}>{backup.createdAt.toLocaleString()} - {backup.actorName}</option>)}</select></div><p className="note-inline">Restoring replaces current settings. A safety backup is created first.</p></FormWithPendingSubmit>}
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
                <td style={{ fontSize: 11 }}>{unit.leaderRank ?? "Not assigned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Crime Tip Blacklist</h2>
      <p className="note-inline">Matching Roblox or Discord submitter identifiers are blocked from sending tips. Matching ignores capitalization and extra spaces.</p>
      <form action={addCrimeTipBlacklistEntry} className="formbox">
        <div className="field-row">
          <div className="field"><label htmlFor="blacklistKind">Identifier type</label><select id="blacklistKind" name="kind" required><option value="roblox">Roblox username or ID</option><option value="discord">Discord username or ID</option></select></div>
          <div className="field"><label htmlFor="blacklistIdentifier">Identifier</label><input id="blacklistIdentifier" name="identifier" required minLength={2} maxLength={160}/></div>
        </div>
        <div className="field"><label htmlFor="blacklistReason">Reason (admin record)</label><input id="blacklistReason" name="reason" required minLength={3} maxLength={500}/></div>
        <button type="submit" className="govbtn">Add to Tip Blacklist</button>
      </form>
      {tipBlacklist.length === 0 ? <p className="message">No identifiers are currently blacklisted.</p> : <div className="tablewrap"><table className="stat"><thead><tr><th>Type</th><th>Identifier</th><th>Reason</th><th>Added by</th><th>Added</th><th>Action</th></tr></thead><tbody>{tipBlacklist.map((entry) => <tr key={entry.id}><td>{entry.kind === "roblox" ? "Roblox" : "Discord"}</td><td>{entry.identifier}</td><td>{entry.reason}</td><td>{entry.createdBy}</td><td>{entry.createdAt.toLocaleString()}</td><td><form action={removeCrimeTipBlacklistEntry}><input type="hidden" name="id" value={entry.id}/><button type="submit" className="linklike">Remove</button></form></td></tr>)}</tbody></table></div>}

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

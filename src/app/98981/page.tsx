import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { hasCapability } from "@/lib/permissions";
import { TIER_DEFINITIONS, ALL_TIERS } from "@/lib/permissions/tiers";
import { CAPABILITIES } from "@/lib/permissions/capabilities";
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
import { ROBLOX_TIER_ROLE_MAPPINGS } from "@/config/roblox-role-mappings";
import { normalizeRobloxTierRoleMappings } from "@/config/role-mapping-migrations";

export default async function SiteSettingsPage({ searchParams }: { searchParams: Promise<{ audit?: string; actor?: string; action?: string; from?: string; to?: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) {
    redirect("/login?error=forbidden");
  }

  const settings = await getSiteSettings();
  const auditFilters = await searchParams;
  const auditQuery = (auditFilters.audit ?? "").trim().slice(0, 120);
  const auditActor = (auditFilters.actor ?? "").trim().slice(0, 120);
  const auditAction = (auditFilters.action ?? "").trim().slice(0, 120);
  const validDay = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  const auditFrom = validDay(auditFilters.from);
  const auditTo = validDay(auditFilters.to);
  const auditWhere = {
    ...(auditActor ? { actorName: { contains: auditActor } } : {}),
    ...(auditAction ? { action: { contains: auditAction } } : {}),
    ...(auditQuery ? { OR: [{ actorName: { contains: auditQuery } }, { action: { contains: auditQuery } }, { details: { contains: auditQuery } }] } : {}),
    ...(auditFrom || auditTo ? { createdAt: { ...(auditFrom ? { gte: new Date(`${auditFrom}T00:00:00.000Z`) } : {}), ...(auditTo ? { lt: (() => { const end = new Date(`${auditTo}T00:00:00.000Z`); end.setUTCDate(end.getUTCDate() + 1); return end; })() } : {}) } } : {}),
  };
  const [savedCapabilities, divisions, ranks, caseStatuses] = await Promise.all([
    getSiteConfiguration<Record<string, string[]>>(
      "tierCapabilities",
      Object.fromEntries(ALL_TIERS.map((tier) => [tier, TIER_DEFINITIONS[tier].capabilities]))
    ),
    getSiteConfiguration("divisions", UNITS),
    getSiteConfiguration("ranks", RANKS),
    getSiteConfiguration("caseStatuses", CASE_STATUSES),
  ]);
  const configuredCapabilities = {
    ...Object.fromEntries(ALL_TIERS.map((tier) => [tier, TIER_DEFINITIONS[tier].capabilities])),
    ...savedCapabilities,
  };
  const [tipConfiguration, backups, auditLogs, tipBlacklist, maintenanceExemptTiers, maintenanceExemptUserIds, websiteVersionOverride, websiteVersion] = await Promise.all([
    getSiteConfiguration("crimeTipForm", null),
    prisma.configurationBackup.findMany({ orderBy: { createdAt: "desc" }, take: 10 }).catch(() => []),
    prisma.settingsAuditLog.findMany({ where: auditWhere, orderBy: { createdAt: "desc" }, take: 100 }).catch(() => []),
    prisma.crimeTipBlacklist.findMany({ orderBy: { createdAt: "desc" } }).catch(() => []),
    getSiteConfiguration<string[]>("maintenanceExemptTiers", []),
    getSiteConfiguration<string[]>("maintenanceExemptDiscordUserIds", []),
    getSiteConfiguration<string>("websiteVersion", ""),
    getWebsiteVersion(),
  ]);
  const [robloxRoleMappings] = await Promise.all([
    getSiteConfiguration("robloxTierRoleMappings", ROBLOX_TIER_ROLE_MAPPINGS).then(normalizeRobloxTierRoleMappings),
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
      <p><Link className="govbtn-outline" href="/98981/roster-sync">Preview Roblox roster sync</Link></p>
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
        <p className="note-inline">Selected permission tiers and individual accounts can continue using the site while maintenance mode is on. Enter IDs from the currently selected sign-in provider, separated by commas or new lines. The admin database sign-in flow remains available.</p>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Exempt permission tiers</legend>
          <div className="cards">{ALL_TIERS.map((tierId) => { const tier = TIER_DEFINITIONS[tierId]; return <label key={tier.id} style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none" }}><input type="checkbox" name="maintenanceExemptTiers" value={tier.id} defaultChecked={maintenanceExemptTiers.includes(tier.id)}/>{tier.label}</label>; })}</div>
        </fieldset>
        <div className="field"><label htmlFor="maintenanceExemptDiscordUserIds">Exempt account IDs</label><textarea id="maintenanceExemptDiscordUserIds" name="maintenanceExemptDiscordUserIds" rows={3} maxLength={2600} defaultValue={maintenanceExemptUserIds.join("\n")} placeholder="Provider account ID" /></div>
      </FormWithPendingSubmit>

      <h2>Website Version</h2>
      <p className="note-inline">Current version: <strong>{websiteVersion}</strong>. Each Git commit automatically increments the patch number by default. For medium or major releases, set <code>VERSION_BUMP=medium</code> or <code>VERSION_BUMP=major</code> before committing. A manual value overrides the automatic version; clear it to return to automatic versioning.</p>
      <form action={updateWebsiteVersion} className="formbox">
        <div className="field"><label htmlFor="websiteVersion">Manual version override <span className="hint">(blank uses the automatic version)</span></label><input id="websiteVersion" name="websiteVersion" inputMode="numeric" pattern="[0-9]+\.[0-9]+\.[0-9]+" defaultValue={websiteVersionOverride} placeholder="0.1.3" /></div>
        <button type="submit" className="govbtn">Save Website Version</button>
      </form>

      <h2>Staff Sign-In &amp; Permissions</h2>
      <p className="note-inline">Roblox OAuth is the only staff sign-in method. Website access is determined exclusively by Roblox group role mappings below. Discord is not used to grant permissions; stored Discord user IDs remain available only for identity linking and optional Discord notifications.</p>

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
              <th>Roblox sign-in</th>
              <td>
                <span className={`pill ${env.ROBLOX_CLIENT_ID && env.ROBLOX_CLIENT_SECRET ? "pill-green" : "pill-red"}`}>{env.ROBLOX_CLIENT_ID && env.ROBLOX_CLIENT_SECRET ? "Configured" : "Not configured"}</span>. Roblox OAuth is the only staff sign-in method.
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

      <h2>Permission Tiers &amp; Roblox Group Roles</h2>
      <p className="note-inline">Update role IDs, access grants, divisions, ranks and case status options below. Credentials and hosting settings remain in Railway.</p>
      <FormWithPendingSubmit action={saveApplicationConfiguration} submitLabel="Save Application Configuration" pendingLabel="Saving…" className="formbox">
        <h3>Roblox community role to permission tier mappings</h3>
        <p className="note-inline">Group ID {32985413}. Role IDs are matched exactly; general-member and provisional roles intentionally grant no staff access. The defaults below map the current community roles and can be edited here.</p>
        <div className="field"><label htmlFor="robloxTierRoleMappings">Roblox role mappings (JSON)</label><textarea id="robloxTierRoleMappings" name="robloxTierRoleMappings" rows={14} defaultValue={JSON.stringify(robloxRoleMappings, null, 2)} spellCheck={false} /></div>
        <h3>Capabilities granted by tier</h3>
        <p className="note-inline">Each role tier has its own independently editable permission set, even when two roles have matching defaults. Available capabilities: {Object.values(CAPABILITIES).join(", ")}. Retain site settings access on at least one tier.</p>
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
              <th>Roblox Group Roles</th>
            </tr>
          </thead>
          <tbody>
            {ALL_TIERS.map((tierId) => {
              const tier = TIER_DEFINITIONS[tierId];
              const mapping = robloxRoleMappings.find((m) => m.tier === tier.id);
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
                      `Group ${mapping.groupId}: ${mapping.roleIds.join(", ")}`
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
      <h2 id="audit">Settings Audit Trail</h2>
      <p className="note-inline">Filter by actor, action, details, or date. Up to 100 matching entries are shown.</p>
      <form className="audit-filter-form"><div className="field"><label htmlFor="audit">Search</label><input id="audit" name="audit" defaultValue={auditQuery} placeholder="Search audit details"/></div><div className="field"><label htmlFor="actor">Actor</label><input id="actor" name="actor" defaultValue={auditActor}/></div><div className="field"><label htmlFor="action">Action</label><input id="action" name="action" defaultValue={auditAction}/></div><div className="field"><label htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={auditFrom}/></div><div className="field"><label htmlFor="to">Through</label><input id="to" name="to" type="date" defaultValue={auditTo}/></div><button className="govbtn" type="submit">Filter</button><Link className="govbtn-outline" href="/98981#audit">Clear</Link></form>
      <p><Link className="govbtn-outline" href={`/98981/audit-export?${new URLSearchParams({ audit: auditQuery, actor: auditActor, action: auditAction, from: auditFrom, to: auditTo }).toString()}`}>Export matching audit entries</Link></p>
      <div className="tablewrap"><table className="stat mobile-cards"><thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Change</th><th scope="col">Details</th></tr></thead><tbody>{auditLogs.length ? auditLogs.map((entry)=><tr key={entry.id}><td data-label="When">{entry.createdAt.toLocaleString()}</td><td data-label="Who">{entry.actorName}</td><td data-label="Change">{entry.action}</td><td data-label="Details">{entry.details}</td></tr>) : <tr><td colSpan={4}>No settings changes match those filters.</td></tr>}</tbody></table></div>
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
          Permanently deletes all saved website data: cases and related records, affidavits,
          releases, requests, notifications, activity logs, staff accounts,
          roster entries, blacklists, rate-limit records, and saved identity data. Your
          Google Forms setup, role/permission mappings, divisions, site settings, configuration
          backups, and configuration audit trail are kept. Everyone will be signed out and must sign in
          again. Only the internal session-revocation marker needed to invalidate existing
          sign-ins is retained. This does not delete submissions already stored in Google
          Forms. This cannot be undone.
        </p>
        <ClearDataForm />
      </div>
      </main>
    </div>
  );
}

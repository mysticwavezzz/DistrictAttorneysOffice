import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { ROBLOX_DA_GROUP_ID } from "@/config/roblox-role-mappings";
import { FormWithPendingSubmit } from "@/components/form-with-pending-submit";
import { applyRobloxRosterSync, previewRobloxRosterSync } from "../roster-sync-actions";
import { staffPageMetadata } from "@/lib/staff-metadata";

export const metadata = staffPageMetadata("Roblox Roster Sync", "Preview Roblox group roster changes and apply rank and active status updates.", "/98981/roster-sync");

type PreviewData = {
  fetchedCount?: number;
  eligibleCount?: number;
  additions?: { username: string; userId: string; roleName: string }[];
  updates?: { entryId: string; username: string; userId: string; roleName: string; oldRank: string | null; unitBefore: string | null; wasActive: boolean; wasSynced: boolean }[];
  inactivations?: { entryId: string; name: string; username: string; oldRank: string | null; newRank: string; reason: string }[];
  unchanged?: unknown[];
  exceptions?: { username?: string; userId?: string; reason: string }[];
  error?: string;
};

const timeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const syncPath = "/98981/roster-sync";

export default async function RobloxRosterSyncPage({ searchParams }: { searchParams: Promise<{ sync?: string; applied?: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) redirect("/login?error=forbidden");
  const query = await searchParams;
  const [selectedRun, history] = await Promise.all([
    query.sync ? prisma.robloxRosterSyncRun.findUnique({ where: { id: query.sync } }) : Promise.resolve(null),
    prisma.robloxRosterSyncRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  let preview: PreviewData | null = null;
  if (selectedRun) {
    try { preview = JSON.parse(selectedRun.previewData) as PreviewData; } catch { preview = { error: "The saved preview could not be read." }; }
  }
  const canApply = selectedRun?.status === "PREVIEW" && selectedRun.actorName === session.user.displayName && selectedRun.expiresAt > new Date();

  return <div>
    <p className="eyebrow">Admin database</p>
    <p><Link href="/98981">← Site settings</Link></p>
    <h1>Roblox Roster Sync</h1>
    <p className="lede">Compare the group roster before applying changes. Roblox controls usernames, rank, and active group membership. Division and bureau assignments are preserved and remain editable in the staff roster.</p>
    <p className="note-inline">Group ID {ROBLOX_DA_GROUP_ID}. Only configured ADA, SADA, CADA, DDA, and DA role IDs are added or updated. DDA and DA entries start in the Office of the District Attorney group with no division assignment. Other new entries also start unassigned until staff place them.</p>

    {query.applied === "1" && <div className="message message-success" role="status">Roster sync applied. Roblox rank and membership status were updated; manual divisions were kept.</div>}
    <FormWithPendingSubmit action={previewRobloxRosterSync} submitLabel="Check Roblox group and preview" pendingLabel="Loading complete group roster…" className="formbox">
      <p>Creates a read-only preview first. No roster changes happen until you confirm an unexpired preview below.</p>
    </FormWithPendingSubmit>

    {selectedRun && preview && <section aria-labelledby="selected-preview">
      <h2 id="selected-preview">Sync checked {timeFormat.format(selectedRun.createdAt)}</h2>
      <p><strong>Status:</strong> {selectedRun.status}{selectedRun.status === "PREVIEW" && <> · Expires {timeFormat.format(selectedRun.expiresAt)}</>}</p>
      {preview.error && <div className="message message-error" role="alert">{preview.error}</div>}
      {selectedRun.status !== "FAILED" && <p>{preview.fetchedCount ?? 0} group members fetched; {preview.eligibleCount ?? 0} ADA+ members matched.</p>}

      {!!preview.additions?.length && <><h3>Will be added ({preview.additions.length})</h3><div className="tablewrap"><table className="stat mobile-cards"><thead><tr><th>Roblox username</th><th>User ID</th><th>Group rank</th><th>Initial assignment</th></tr></thead><tbody>{preview.additions.map((entry) => <tr key={`add-${entry.userId}`}><td data-label="Roblox username">{entry.username}</td><td data-label="User ID">{entry.userId}</td><td data-label="Group rank">{entry.roleName}</td><td data-label="Initial assignment">Unassigned</td></tr>)}</tbody></table></div></>}
      {!!preview.updates?.length && <><h3>Will be updated ({preview.updates.length})</h3><div className="tablewrap"><table className="stat mobile-cards"><thead><tr><th>Roster entry</th><th>Roblox username</th><th>Rank</th><th>Division / bureau</th><th>Membership</th></tr></thead><tbody>{preview.updates.map((entry) => <tr key={`update-${entry.userId}`}><td data-label="Roster entry">{entry.oldRank ? `${entry.oldRank} → ${entry.roleName}` : `Add Roblox identity · ${entry.roleName}`}</td><td data-label="Roblox username">{entry.username}</td><td data-label="Rank">{entry.roleName}</td><td data-label="Division / bureau">{entry.unitBefore ?? "Unassigned"} (kept)</td><td data-label="Membership">{entry.wasActive ? "Active" : "Reactivate"}</td></tr>)}</tbody></table></div></>}
      {!!preview.inactivations?.length && <><h3>Will be marked inactive ({preview.inactivations.length})</h3><div className="tablewrap"><table className="stat mobile-cards"><thead><tr><th>Roster entry</th><th>Roblox identity</th><th>Previous rank</th><th>Current group status</th></tr></thead><tbody>{preview.inactivations.map((entry) => <tr key={`inactive-${entry.entryId}`}><td data-label="Roster entry">{entry.name}</td><td data-label="Roblox identity">{entry.username}</td><td data-label="Previous rank">{entry.oldRank ?? "Not recorded"}</td><td data-label="Current group status">{entry.reason} {entry.newRank !== "Not in group" ? `Current role: ${entry.newRank}.` : ""}</td></tr>)}</tbody></table></div></>}
      {!preview.additions?.length && !preview.updates?.length && !preview.inactivations?.length && selectedRun.status === "PREVIEW" && <div className="message">No roster changes are needed.</div>}
      {!!preview.exceptions?.length && <><h3>Needs attention ({preview.exceptions.length})</h3><div className="message message-error" role="status"><ul>{preview.exceptions.map((entry, index) => <li key={`${entry.userId ?? entry.username ?? "exception"}-${index}`}>{entry.username ? <strong>{entry.username}: </strong> : null}{entry.reason}</li>)}</ul></div></>}
      {canApply && selectedRun.additions + selectedRun.updates + selectedRun.inactivations > 0 && <FormWithPendingSubmit action={applyRobloxRosterSync} submitLabel="Apply this roster sync" pendingLabel="Applying roster changes…" className="formbox">
        <input type="hidden" name="syncId" value={selectedRun.id}/>
        <p><strong>Confirm:</strong> this applies the listed rank and active-status changes. Existing division and bureau assignments will not be changed.</p>
      </FormWithPendingSubmit>}
    </section>}

    <section aria-labelledby="sync-history"><h2 id="sync-history">Recent sync history</h2>{history.length ? <div className="tablewrap"><table className="stat mobile-cards"><thead><tr><th>Checked</th><th>By</th><th>Status</th><th>Added</th><th>Updated</th><th>Inactive</th><th>Exceptions</th><th>Details</th></tr></thead><tbody>{history.map((run) => <tr key={run.id}><td data-label="Checked"><time dateTime={run.createdAt.toISOString()}>{timeFormat.format(run.createdAt)}</time></td><td data-label="By">{run.actorName}</td><td data-label="Status">{run.status}</td><td data-label="Added">{run.additions}</td><td data-label="Updated">{run.updates}</td><td data-label="Inactive">{run.inactivations}</td><td data-label="Exceptions">{run.exceptions}</td><td data-label="Details"><Link href={`${syncPath}?sync=${encodeURIComponent(run.id)}`}>View preview/log</Link></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>No sync history yet</h3><p>Run a group check to create the first preview record.</p></div>}</section>
  </div>;
}

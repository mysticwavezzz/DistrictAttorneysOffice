import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { RANKS } from "@/config/ranks";
import { UNITS } from "@/config/units";
import { updateRosterEntry, removeRosterEntry } from "../actions";
import { RemoveButton } from "@/components/remove-button";
import { FormWithPendingSubmit } from "@/components/form-with-pending-submit";
import { getSiteConfiguration } from "@/lib/site-settings";
import { localUser, canManageRosterInDivision, canManageUnassignedRosterEntry } from "@/lib/case-access";
import { staffPageMetadata } from "@/lib/staff-metadata";

export const metadata = staffPageMetadata("Staff Profile", "Review an employee roster entry and manage permitted roster details.", "/dashboard/roster");

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export default async function EditRosterEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE) && !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE_DIVISION))) {
    redirect("/login?error=forbidden");
  }

  const entry = await prisma.rosterEntry.findUnique({ where: { id } });
  if (!entry) notFound();
  const user = await localUser(session.user);
  const mayManageEntry = canManageRosterInDivision(session.user.tiers, user?.division, entry.unit)
    || canManageUnassignedRosterEntry(session.user.tiers, user?.division, entry.unit, entry.rank);
  if (!user || !mayManageEntry) notFound();
  const [ranks, divisions] = await Promise.all([
    getSiteConfiguration("ranks", RANKS),
    getSiteConfiguration("divisions", UNITS),
  ]);
  const visibleDivisions = hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE) ? divisions : divisions.filter((division) => division.value === user.division);

  return (
    <div>
      <h1>Edit Roster Entry</h1>

      <FormWithPendingSubmit
        action={updateRosterEntry}
        submitLabel="Save Changes"
        pendingLabel="Saving…"
        className="formbox"
      >
        <input type="hidden" name="id" value={entry.id} />
        <div className="field-row">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input type="text" id="name" name="name" required maxLength={100} defaultValue={entry.name} readOnly={entry.robloxSynced} />
          </div>
          <div className="field">
            <label htmlFor="rank">Rank</label>
            {entry.robloxSynced ? <>
              <input type="text" id="rank" value={entry.rank ?? "Not assigned"} readOnly aria-describedby="synced-rank-hint" />
              <span className="hint" id="synced-rank-hint">Synced from Roblox. Run a roster sync to update this rank.</span>
              <input type="hidden" name="rank" value={entry.rank ?? ""} />
            </> : <select id="rank" name="rank" defaultValue={entry.rank ?? ""} required>
              <option value="" disabled>
                Select a rank
              </option>
            {ranks.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>}
          </div>
          <div className="field">
            <label htmlFor="unit">
              Unit / Bureau <span className="hint">{!canManageRosterInDivision(session.user.tiers, user.division, entry.unit) ? "(select your division to assign this unassigned staff member)" : "(optional. Determines which leadership position a leadership rank fills)"}</span>
            </label>
            <select id="unit" name="unit" defaultValue={entry.unit ?? ""} required={!canManageRosterInDivision(session.user.tiers, user.division, entry.unit)}>
              <option value="" disabled={!canManageRosterInDivision(session.user.tiers, user.division, entry.unit)}>{entry.unit ? "No unit set" : "Choose your division"}</option>
              {visibleDivisions.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="divisionGroup">Criminal Division group <span className="hint">(Group 1 or 2; sets the employee’s case-review team)</span></label>
            <select id="divisionGroup" name="divisionGroup" defaultValue={entry.divisionGroup ?? ""}>
              <option value="">No group assigned</option>
              <option value="1">Group 1</option>
              <option value="2">Group 2</option>
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="discordUserId">
              Discord User ID <span className="hint">(optional)</span>
            </label>
            <input
              type="text"
              id="discordUserId"
              name="discordUserId"
              maxLength={50}
              defaultValue={entry.discordUserId ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="robloxUserId">Roblox User ID <span className="hint">(links division access to the authenticated Roblox account)</span></label>
            <input type="text" id="robloxUserId" name="robloxUserId" inputMode="numeric" pattern="[0-9]*" maxLength={30} defaultValue={entry.robloxUserId ?? ""} readOnly={entry.robloxSynced} />
          </div>
          <div className="field">
            <label htmlFor="startDate">
              Start Date <span className="hint">(optional)</span>
            </label>
            <input type="date" id="startDate" name="startDate" defaultValue={toDateInputValue(entry.startDate)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="imageUrl">
            Profile Picture URL <span className="hint">(optional. Stored in the staff roster)</span>
          </label>
          <input
            type="text"
            id="imageUrl"
            name="imageUrl"
            maxLength={2000}
            placeholder="https://"
            defaultValue={entry.imageUrl ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="about">
            About Me <span className="hint">(optional. Stored in the staff roster)</span>
          </label>
          <textarea id="about" name="about" rows={3} maxLength={2000} defaultValue={entry.about ?? ""} />
        </div>
      </FormWithPendingSubmit>

      {!entry.robloxSynced && canManageRosterInDivision(session.user.tiers, user.division, entry.unit) && <RemoveButton
        id={entry.id}
        action={removeRosterEntry}
        label="Remove from Roster"
        pendingLabel="Removing…"
        className="govbtn"
        style={{ background: "var(--down)", borderColor: "#6b2018" }}
        formStyle={{ marginTop: 16 }}
      />}
      {entry.robloxSynced && <p className="note-inline">This roster record is managed by Roblox group sync. Remove the member from the Roblox group and run a sync to mark them inactive.</p>}
    </div>
  );
}

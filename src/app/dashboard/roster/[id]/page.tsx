import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { RANKS } from "@/config/ranks";
import { UNITS } from "@/config/units";
import { updateRosterEntry, removeRosterEntry, setRosterRankOverride } from "../actions";
import { RemoveButton } from "@/components/remove-button";
import { FormWithPendingSubmit } from "@/components/form-with-pending-submit";
import { DivisionRosterFields } from "@/components/division-roster-fields";
import { getSiteConfiguration } from "@/lib/site-settings";
import { localUser, canManageRosterInDivision, canManageUnassignedRosterEntry } from "@/lib/case-access";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { canAssignStaffRank, canControlStaff } from "@/lib/staff-rank-control";
import { isAssignableAttorneyRank } from "@/lib/case-assignees";

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
  const canControl = canControlStaff(session.user.tiers, session.user.providerUserId, user.division, entry);
  const assignableRanks = ranks.filter((rank) => canAssignStaffRank(session.user.tiers, rank.value));

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
      {canControl && entry.unit === "Criminal Division" && isAssignableAttorneyRank(entry.rank) && entry.robloxUserId && <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="onboardingRoute">Attorney onboarding route</label>
        <select id="onboardingRoute" name="onboardingRoute" defaultValue={entry.onboardingRoute ?? (entry.isProsecutorInTraining ? "TRAINING" : "UNASSIGNED")}>
          <option value="UNASSIGNED">Not enrolled</option>
          <option value="TRAINING">Prosecutor in Training</option>
          <option value="EXPERIENCED">Experienced attorney, orientation only</option>
        </select>
        <label htmlFor="trainingExemptionReason">Experience review note <span className="hint">(required for experienced route)</span></label>
        <textarea id="trainingExemptionReason" name="trainingExemptionReason" rows={2} maxLength={1000} defaultValue={entry.trainingExemptionReason ?? ""} placeholder="Briefly record the prior criminal case work or appearances reviewed." />
        <p className="hint">The experienced route requires a group placement and a supervisor&apos;s written reason. Both routes require office orientation before staff access opens.</p>
        <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <input type="checkbox" name="isProsecutorInTraining" defaultChecked={entry.isProsecutorInTraining} />
          <span>Prosecutor-in-Training <span className="hint">(restrict this account to the Learning Course until completion)</span></span>
        </label>
        {entry.orientationPending && <p role="status" className="hint">Orientation acknowledgment is pending. Group {entry.divisionGroup ?? "not placed"}.</p>}
        {entry.orientationAcknowledgedAt && <p className="hint">Orientation acknowledged {entry.orientationAcknowledgedAt.toLocaleDateString()}.</p>}
        {entry.onboardingRoute && <p className="hint">Onboarding route: {entry.onboardingRoute === "TRAINING" ? "Prosecutor in Training" : "Experienced attorney"}{entry.trainingSupervisor ? ` · reviewed by ${entry.trainingSupervisor}` : ""}.</p>}
        {entry.trainingExemptionReason && <p className="hint">Experience review: {entry.trainingExemptionReason}</p>}
        {entry.trainingPlacementStatus === "PLACED_RANK_REVIEW" && <p role="status" className="hint">Training is complete. A pre-existing rank was preserved; leadership should review the rank before independent assignment.</p>}
      </div>}
          <div className="field">
            <label htmlFor="rank">Rank</label>
            <input type="text" id="rank" value={entry.rank ?? "Not assigned"} readOnly />
            <input type="hidden" name="rank" value={entry.rank ?? ""} />
            {entry.rankOverride && <span className="hint">Manual rank override. Roblox rank: {entry.robloxRoleName ?? "not recorded"}.</span>}
          </div>
          <DivisionRosterFields
            divisions={visibleDivisions}
            unitId="unit"
            initialUnit={entry.unit ?? ""}
            initialGroup={entry.divisionGroup ?? ""}
            unitRequired={!canManageRosterInDivision(session.user.tiers, user.division, entry.unit)}
            unitHint={!canManageRosterInDivision(session.user.tiers, user.division, entry.unit) ? "(select your division to assign this unassigned staff member)" : "(optional. Determines which leadership position a leadership rank fills)"}
            groupHint="(Group 1 or 2; sets the employee’s case-review team)"
          />
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

      {canControl && <section className="formbox" style={{ marginTop: 16 }} aria-labelledby="rank-control-title">
        <h2 id="rank-control-title">Rank and access</h2>
        <p className="hint">{entry.robloxSynced ? "A manual rank replaces this member’s synced rank and site permissions until you restore the Roblox rank." : "Set this member’s roster rank and site permissions."}</p>
        <FormWithPendingSubmit action={setRosterRankOverride} submitLabel="Save rank" pendingLabel="Saving rank…">
          <input type="hidden" name="id" value={entry.id} />
          <div className="field"><label htmlFor="rankOverride">Rank</label><select id="rankOverride" name="rankOverride" defaultValue={entry.rankOverride ?? (entry.robloxSynced ? "" : entry.rank ?? "")} required={!entry.robloxSynced}>
            {entry.robloxSynced && <option value="">Use Roblox rank ({entry.robloxRoleName ?? entry.rank ?? "not recorded"})</option>}
            {assignableRanks.map((rank) => <option key={rank.value} value={rank.value}>{rank.label}</option>)}
          </select></div>
        </FormWithPendingSubmit>
      </section>}

      {canControl && <RemoveButton
        id={entry.id}
        action={removeRosterEntry}
        label={entry.robloxUserId ? "Remove site access and roster entry" : "Remove from roster"}
        pendingLabel="Removing…"
        className="govbtn"
        style={{ background: "var(--down)", borderColor: "#6b2018" }}
        formStyle={{ marginTop: 16 }}
        confirmMessage={entry.robloxUserId ? `Remove ${entry.name} from the roster and revoke website access for Roblox account ${entry.robloxUserId}? Group sync will not restore access.` : `Remove ${entry.name} from the roster?`}
      />}
      {entry.robloxSynced && <p className="note-inline">Roblox still controls group membership. A manual rank override survives sync; removing site access prevents this account from being re-added by sync.</p>}
    </div>
  );
}

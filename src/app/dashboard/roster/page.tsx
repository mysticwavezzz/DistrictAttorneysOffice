import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { RANKS, isLeadershipRank } from "@/config/ranks";
import { UNITS } from "@/config/units";
import { addRosterEntry, removeRosterEntry, setRosterActive, updateCriminalGroupAssignment, placeTrainingGraduate, reviewTrainingAttempt } from "./actions";
import { RemoveButton } from "@/components/remove-button";
import { FormWithPendingSubmit } from "@/components/form-with-pending-submit";
import { getSiteConfiguration } from "@/lib/site-settings";
import { SafeImage } from "@/components/safe-image";
import { localUser, canManageCriminalGroupRosterEntry } from "@/lib/case-access";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { DashboardFoldPersistence } from "@/components/dashboard-fold-persistence";
import { DivisionRosterFields } from "@/components/division-roster-fields";
import { canControlStaff } from "@/lib/staff-rank-control";

export const metadata = staffPageMetadata("Staff Roster", "Review active staff, divisions, synced Roblox ranks, and manual assignments.", "/dashboard/roster");

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

type RosterEntry = Awaited<ReturnType<typeof prisma.rosterEntry.findMany>>[number];

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ q?: string; rank?: string; unit?: string; group?: string; active?: string }> }) {
  const session = await auth();
  const hasGroupLeadTier = Boolean(session?.user?.tiers.includes("senior_assistant_district_attorney") && hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION));
  if (!session?.user || (!hasCapability(session.user.tiers, CAPABILITIES.ROSTER_VIEW) && !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_VIEW_DIVISION) && !hasGroupLeadTier)) {
    redirect("/login?error=forbidden");
  }

  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const viewerTiers = session.user.tiers;
  const viewerDivision = user.division;
  const viewerGroup = user.divisionGroup;
  if (hasGroupLeadTier && !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_VIEW) && !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_VIEW_DIVISION)
    && (user.division !== "Criminal Division" || !user.divisionGroup)) redirect("/login?error=forbidden");
  const canManageAll = hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE);
  const canManageDivision = Boolean(user.division) && hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE_DIVISION);
  const canViewUnassignedOnly = !user.division && (
    hasCapability(session.user.tiers, CAPABILITIES.ROSTER_VIEW_DIVISION)
    || hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE_DIVISION)
  );
  const canManage = canManageAll || canManageDivision;
  const canManageOwnGroup = hasGroupLeadTier && !canManageAll && !canManageDivision && user.division === "Criminal Division" && Boolean(user.divisionGroup);
  const canViewOwnGroup = hasGroupLeadTier && Boolean(user.divisionGroup) && !canManageAll && !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_VIEW) && !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_VIEW_DIVISION);
  const allDivisions = await getSiteConfiguration("divisions", UNITS);
  const divisions = canManageAll || hasCapability(session.user.tiers, CAPABILITIES.ROSTER_VIEW) ? allDivisions : allDivisions.filter((division) => division.value === user.division);
  const ranks = await getSiteConfiguration("ranks", RANKS);
  const filters = await searchParams;

  let entries: RosterEntry[] = [];
  try {
    entries = await prisma.rosterEntry.findMany({
      where: canManageAll || hasCapability(session.user.tiers, CAPABILITIES.ROSTER_VIEW)
        ? {}
        : canViewOwnGroup
          ? { unit: "Criminal Division", OR: [{ divisionGroup: user.divisionGroup }, { divisionGroup: null }] }
        : canManageDivision
          ? { OR: [{ unit: user.division }, { unit: null }, { unit: "" }] }
          : canViewUnassignedOnly
            ? { OR: [{ unit: null }, { unit: "" }] }
            : { unit: user.division ?? "__unassigned__" },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("Failed to load roster", error);
  }
  const linkedDiscordByRobloxId = new Map<string, string>();
  const linkedUsers = await prisma.user.findMany({ where: { robloxUserId: { in: entries.flatMap((entry) => entry.robloxUserId ? [entry.robloxUserId] : []) }, discordUserId: { not: null } }, select: { robloxUserId: true, discordUserId: true } }).catch(() => []);
  for (const linkedUser of linkedUsers) if (linkedUser.robloxUserId && linkedUser.discordUserId) linkedDiscordByRobloxId.set(linkedUser.robloxUserId, linkedUser.discordUserId);
  const linkedDiscordId = (entry: RosterEntry) => (entry.robloxUserId && linkedDiscordByRobloxId.get(entry.robloxUserId)) || entry.discordUserId;
  const usersByRobloxId = new Map((await prisma.user.findMany({ where: { robloxUserId: { in: entries.flatMap((entry) => entry.robloxUserId ? [entry.robloxUserId] : []) } }, select: { id: true, robloxUserId: true } }).catch(() => [])).flatMap((linked) => linked.robloxUserId ? [[linked.robloxUserId, linked.id] as const] : []));
  const caseLoads = await prisma.case.groupBy({ by: ["assignedAttorneyId"], where: { archived: false, isDraft: false, assignedAttorneyId: { not: null }, OR: [
    { stage: null },
    { stage: { notIn: ["Closed - Convicted", "Closed - Plea Agreement", "Closed - Dismissed", "Closed - Acquitted"] } },
  ] }, _count: { _all: true } }).catch(() => []);
  const caseLoadByUserId = new Map(caseLoads.flatMap((row) => row.assignedAttorneyId ? [[row.assignedAttorneyId, row._count._all] as const] : []));
  const caseLoad = (entry: RosterEntry) => entry.robloxUserId ? caseLoadByUserId.get(usersByRobloxId.get(entry.robloxUserId) ?? "") ?? 0 : 0;
  const filteredEntries = entries.filter((entry) =>
    (filters.active !== "yes" || entry.isActive) && (filters.active !== "no" || !entry.isActive) &&
    (!filters.q || `${entry.name} ${linkedDiscordId(entry) ?? ""}`.toLowerCase().includes(filters.q.toLowerCase())) &&
    (!filters.rank || entry.rank === filters.rank) && (!filters.unit || entry.unit === filters.unit) && (!filters.group || entry.divisionGroup === filters.group)
  );
  const pendingTrainingPlacements = entries.filter((entry) => entry.isActive && entry.unit === "Criminal Division" && entry.isProsecutorInTraining && entry.trainingPlacementStatus === "PLACEMENT_PENDING");
  const pendingTrainingReviews = canManageAll || canManageDivision || canManageOwnGroup
    ? await prisma.trainingAttempt.findMany({ where: { status: "MOCK", needsSupervisorReview: true }, include: { user: { select: { robloxUserId: true } } }, orderBy: { updatedAt: "asc" } }).then((attempts) => attempts.flatMap((attempt) => {
      const entry = entries.find((item) => item.robloxUserId === attempt.user.robloxUserId && item.unit === "Criminal Division" && (!canManageOwnGroup || canManageDivision || canManageAll || item.divisionGroup === viewerGroup));
      return entry ? [{ attempt, entry }] : [];
    }))
    : [];
  const vacantUnits = new Set(divisions.filter((division) => !entries.some((entry) => entry.unit === division.value)).map((division) => division.value));
  const officeRanks = new Set(["District Attorney", "Deputy District Attorney", "Chief of Staff"]);
  if (!canManageAll && canManageDivision) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (!entries[i]!.unit && officeRanks.has(entries[i]!.rank ?? "")) entries.splice(i, 1);
    }
  }

  const groups: { key: string; label: string; description?: string; entries: RosterEntry[] }[] = [
    { key: "__office__", label: "Office of the District Attorney", description: "District Attorney, Deputy District Attorney, and Chief of Staff.", entries: [] as RosterEntry[] },
    ...divisions.map((u) => ({ key: u.value, label: u.label, description: u.description, entries: [] as RosterEntry[] })),
    { key: "", label: "Unassigned", entries: [] as RosterEntry[] },
  ];
  const unassignedGroup = groups[groups.length - 1]!;
  for (const entry of filteredEntries) {
    const group = officeRanks.has(entry.rank ?? "") && !entry.unit
      ? groups[0]!
      : groups.find((g) => g.key === (entry.unit ?? "")) ?? unassignedGroup;
    group.entries.push(entry);
  }

  function renderGroup(group: (typeof groups)[number]) {
    if (group.entries.length === 0 && group.key !== "__office__") return null;
    return (
      <details key={group.key} className="roster-division" data-fold-key={`roster:${group.key || "unassigned"}`}>
        <summary><span>{group.label}</span><span className="roster-division-count">{group.entries.length} staff</span></summary>
        <div className="roster-division-body">
        {group.description && <p className="note-inline">{group.description}</p>}
        <div className="roster-cards">
          {group.entries.map((entry) => <article className="roster-card" key={entry.id}>
            {entry.imageUrl && <SafeImage src={entry.imageUrl} alt="" width={54} height={54} />}
            <h4>{entry.name}</h4>
            <p>{entry.rank ?? "Rank not set"} {isLeadershipRank(entry.rank) && <span className="pill pill-gold">Leadership</span>}</p>
            <p className="roster-case-load">Assigned active cases: <strong>{caseLoad(entry)}</strong></p>
            <p className="mono">Discord: {linkedDiscordId(entry) ?? "Not linked"}</p>
            <p>Start date: {entry.startDate ? dateFormatter.format(entry.startDate) : "Not set"}</p>
            <div className="roster-card-badges">
              <span className={`pill ${entry.isActive ? "pill-green" : "pill-muted"}`}>{entry.isActive ? "Roster active" : "Roster inactive"}</span>
              {entry.divisionGroup && <span className="pill pill-navy">Group {entry.divisionGroup}</span>}
              {entry.robloxSynced && <span className="pill pill-gold">Roblox synced</span>}
              {entry.rankOverride && <span className="pill pill-navy">Rank override</span>}
            </div>
            {(canManage || (canManageOwnGroup && canManageCriminalGroupRosterEntry(viewerTiers, viewerDivision, viewerGroup, entry.unit, entry.divisionGroup))) && <div className="roster-card-actions">
              {canManage && <Link className="govbtn-outline" href={`/dashboard/roster/${entry.id}`}>{!entry.unit && !canManageAll ? "Assign to my division" : "Edit profile"}</Link>}
              {canManageOwnGroup && canManageCriminalGroupRosterEntry(viewerTiers, viewerDivision, viewerGroup, entry.unit, entry.divisionGroup) && <form action={updateCriminalGroupAssignment} className="roster-group-assignment"><input type="hidden" name="id" value={entry.id} /><label htmlFor={`group-${entry.id}`}>Group</label><select id={`group-${entry.id}`} name="divisionGroup" defaultValue={entry.divisionGroup ?? ""}><option value="">Unassigned</option><option value={viewerGroup!}>Group {viewerGroup}</option></select><button className="govbtn-outline" type="submit">Save</button></form>}
              {canManage && (canManageAll || entry.unit === (user?.division ?? null)) && !entry.robloxSynced && <form action={setRosterActive}><input type="hidden" name="id" value={entry.id}/><input type="hidden" name="isActive" value={String(!entry.isActive)}/><button className="linklike" type="submit">Mark {entry.isActive ? "inactive" : "active"}</button></form>}
              {canControlStaff(session!.user.tiers, session!.user.providerUserId, user!.division, entry) && <RemoveButton id={entry.id} action={removeRosterEntry} label="Remove access" confirmMessage={`Remove ${entry.name} from the roster${entry.robloxUserId ? " and revoke this Roblox account's website access" : ""}? Group sync will not restore a revoked account.`} />}
            </div>}
          </article>)}
        </div>
        </div>
      </details>
    );
  }

  return (
    <div>
      <DashboardFoldPersistence accountId={user.id} />
      <h1>Staff Roster</h1>
      {hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE) && <p><Link className="govbtn-outline" href="/98981/roster-sync">Roblox roster sync</Link></p>}

      {pendingTrainingPlacements.length > 0 && (canManageAll || canManageDivision || canManageOwnGroup) && <section className="formbox" aria-labelledby="training-placement-heading">
        <h2 id="training-placement-heading">Passed course, awaiting group placement</h2>
        <p className="hint">Choose a group with an active supervisor. Placement never assigns a live case; the graduate must complete orientation before staff access opens.</p>
        {pendingTrainingPlacements.map((entry) => <FormWithPendingSubmit key={entry.id} action={placeTrainingGraduate} submitLabel={`Place ${entry.name}`} pendingLabel="Placing…" className="formbox">
          <input type="hidden" name="id" value={entry.id} />
          <p><strong>{entry.name}</strong> passed the final mock trial. The course result remains recorded.</p>
          <div className="field"><label htmlFor={`placement-${entry.id}`}>Criminal Division group</label><select id={`placement-${entry.id}`} name="divisionGroup" defaultValue={canManageOwnGroup && !canManageDivision && !canManageAll ? user.divisionGroup ?? "" : ""} required>
            {!(canManageOwnGroup && !canManageDivision && !canManageAll) && <option value="" disabled>Select group</option>}
            {(canManageOwnGroup && !canManageDivision && !canManageAll ? [user.divisionGroup!] : ["1", "2"]).map((group) => <option key={group} value={group}>Group {group}</option>)}
          </select></div>
        </FormWithPendingSubmit>)}
      </section>}
      {pendingTrainingReviews.length > 0 && <section className="formbox" aria-labelledby="training-review-heading">
        <h2 id="training-review-heading">Mock trials awaiting supervisor review</h2>
        <p className="hint">Two unsuccessful full mock trials trigger a coaching review. Recording the review clears the flag but does not change the trainee’s answers or score.</p>
        {pendingTrainingReviews.map(({ attempt, entry }) => <FormWithPendingSubmit key={attempt.id} action={reviewTrainingAttempt} submitLabel="Record review" pendingLabel="Saving…" className="formbox">
          <input type="hidden" name="attemptId" value={attempt.id} />
          <p><strong>{entry.name}</strong> · {attempt.mockFailures} unsuccessful full mock trials.</p>
          <div className="field"><label htmlFor={`review-note-${attempt.id}`}>Supervisor review note</label><textarea id={`review-note-${attempt.id}`} name="reviewNote" rows={2} minLength={5} maxLength={1000} required /></div>
        </FormWithPendingSubmit>)}
      </section>}

      <details className="dashboard-fold roster-filter-fold" data-fold-key="roster-filters" open={Boolean(filters.q || filters.rank || filters.unit || filters.group || (filters.active && filters.active !== "all"))}>
      <summary><span className="dashboard-fold-title">Search and filter staff</span></summary>
      <form method="get" className="formbox roster-filters" aria-label="Filter staff roster">
        <div className="field"><label htmlFor="roster-search">Search name or Discord ID</label><input id="roster-search" name="q" defaultValue={filters.q} /></div>
        <div className="field"><label htmlFor="roster-rank">Rank</label><select id="roster-rank" name="rank" defaultValue={filters.rank ?? ""}><option value="">All ranks</option>{ranks.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
        <div className="field"><label htmlFor="roster-unit">Division</label><select id="roster-unit" name="unit" defaultValue={filters.unit ?? ""}><option value="">All divisions</option>{divisions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></div>
        <div className="field"><label htmlFor="roster-group">Criminal group</label><select id="roster-group" name="group" defaultValue={filters.group ?? ""}><option value="">All visible groups</option>{(canViewOwnGroup ? [user.divisionGroup!] : ["1", "2"]).map((group) => <option key={group} value={group}>Group {group}</option>)}</select></div>
        <div className="field"><label htmlFor="roster-active">Roster status</label><select id="roster-active" name="active" defaultValue={filters.active ?? "all"}><option value="all">All</option><option value="yes">Active</option><option value="no">Inactive</option></select></div>
        <button className="govbtn" type="submit">Filter</button><Link className="govbtn-outline" href="/dashboard/roster">Clear</Link>
      </form>
      </details>

      {filteredEntries.length === 0 ? (
        <div className="message">{entries.length ? "No staff match these filters." : "No roster entries yet."}</div>
      ) : (
        groups.map((group) => vacantUnits.has(group.key) && group.key !== "" ? (
          <section key={group.key} className="vacant-unit" aria-label={`${group.label} has no assigned staff`}>
            <h2>{group.label}</h2>
            {group.description && <p className="note-inline">{group.description}</p>}
            <p><span className="pill pill-muted">Position vacant</span> No staff are currently assigned to this unit.</p>
          </section>
        ) : renderGroup(group))
      )}

      {canManage && (
        <>
          <h2>Add Employee</h2>
          <FormWithPendingSubmit
            action={addRosterEntry}
            submitLabel="Add Employee"
            pendingLabel="Adding…"
            className="formbox"
          >
            <div className="field-row">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input type="text" id="name" name="name" required maxLength={100} />
              </div>
              <div className="field">
                <label htmlFor="rank">Rank</label>
                <select id="rank" name="rank" defaultValue="" required>
                  <option value="" disabled>
                    Select a rank
                  </option>
                  {ranks.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <DivisionRosterFields
                divisions={divisions}
                unitId="new-roster-unit"
                unitHint="(optional. Determines which leadership position a leadership rank fills)"
                groupHint="(optional; assigns a supervising SADA group)"
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="discordUserId">
                  Discord User ID <span className="hint">(optional)</span>
                </label>
                <input type="text" id="discordUserId" name="discordUserId" maxLength={50} />
              </div>
              <div className="field">
                <label htmlFor="robloxUserId">Roblox User ID <span className="hint">(links division access to the authenticated Roblox account)</span></label>
                <input type="text" id="robloxUserId" name="robloxUserId" inputMode="numeric" pattern="[0-9]*" maxLength={30} />
              </div>
              <div className="field">
                <label htmlFor="startDate">
                  Start Date <span className="hint">(optional)</span>
                </label>
                <input type="date" id="startDate" name="startDate" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="imageUrl">
                Profile Picture URL <span className="hint">(optional. Stored in the staff roster)</span>
              </label>
              <input type="text" id="imageUrl" name="imageUrl" maxLength={2000} placeholder="https://" />
            </div>
            <div className="field">
              <label htmlFor="about">
                About Me <span className="hint">(optional. Stored in the staff roster)</span>
              </label>
              <textarea id="about" name="about" rows={3} maxLength={2000} />
            </div>
          </FormWithPendingSubmit>
        </>
      )}
    </div>
  );
}

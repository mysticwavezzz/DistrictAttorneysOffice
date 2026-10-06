import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { RANKS, isLeadershipRank } from "@/config/ranks";
import { UNITS } from "@/config/units";
import { addRosterEntry, removeRosterEntry, setRosterActive, updateCriminalGroupAssignment } from "./actions";
import { RemoveButton } from "@/components/remove-button";
import { FormWithPendingSubmit } from "@/components/form-with-pending-submit";
import { getSiteConfiguration } from "@/lib/site-settings";
import { SafeImage } from "@/components/safe-image";
import { localUser, canManageCriminalGroupRosterEntry } from "@/lib/case-access";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { DashboardFoldPersistence } from "@/components/dashboard-fold-persistence";

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
          ? { OR: [{ unit: user.division }, { unit: null }] }
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
          {group.entries.map((entry) => <article className="roster-card" key={`card-${entry.id}`}>
            {entry.imageUrl && <SafeImage src={entry.imageUrl} alt="" width={54} height={54} />}
            <h4>{entry.name}</h4><p>{entry.rank ?? "Rank not set"}</p><p className="roster-case-load">Assigned active cases: <strong>{caseLoad(entry)}</strong></p>
            <div className="roster-card-badges">
              <span className={`pill ${entry.isActive ? "pill-green" : "pill-muted"}`}>{entry.isActive ? "Roster active" : "Roster inactive"}</span>
            {entry.divisionGroup && <span className="pill pill-navy">Group {entry.divisionGroup}</span>}
              {entry.robloxSynced && <span className="pill pill-gold">Roblox synced</span>}
              <span className={`pill ${linkedDiscordId(entry) ? "pill-green" : "pill-muted"}`}>{linkedDiscordId(entry) ? "Discord linked" : "No Discord linked"}</span>
            </div>
            {(canManage || (canManageOwnGroup && canManageCriminalGroupRosterEntry(viewerTiers, viewerDivision, viewerGroup, entry.unit, entry.divisionGroup))) && <div className="roster-card-actions">
              {canManage && <Link className="govbtn-outline" href={`/dashboard/roster/${entry.id}`}>{!entry.unit && !canManageAll ? "Assign to my division" : "Edit profile"}</Link>}
              {canManageOwnGroup && canManageCriminalGroupRosterEntry(viewerTiers, viewerDivision, viewerGroup, entry.unit, entry.divisionGroup) && <form action={updateCriminalGroupAssignment} className="roster-group-assignment"><input type="hidden" name="id" value={entry.id} /><label htmlFor={`group-card-${entry.id}`}>Group</label><select id={`group-card-${entry.id}`} name="divisionGroup" defaultValue={entry.divisionGroup ?? ""}><option value="">Unassigned</option><option value={viewerGroup!}>Group {viewerGroup}</option></select><button className="govbtn-outline" type="submit">Save</button></form>}
            </div>}
          </article>)}
        </div>
        <div className="tablewrap">
          <table className="stat mobile-cards">
            <thead>
              <tr>
                <th>Name</th>
                <th>Rank</th>
                <th>Criminal group</th>
                <th>Discord</th>
                <th>Start Date</th>
                <th>Roster status</th>
                <th>Assigned active cases</th>
                {(canManage || canManageOwnGroup) && <th />}
              </tr>
            </thead>
            <tbody>
              {group.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Name">{entry.name}</td>
                    <td data-label="Rank">
                      {entry.rank ?? "Not assigned"}{" "}
                      {isLeadershipRank(entry.rank) && <span className="pill pill-gold">Leadership</span>}
                    </td>
                    <td data-label="Criminal group">{entry.divisionGroup ? `Group ${entry.divisionGroup}` : "—"}</td>
                    <td data-label="Discord" className="mono">
                      {linkedDiscordId(entry) ?? "Not linked"}{" "}
                    </td>
                    <td data-label="Start date">{entry.startDate ? dateFormatter.format(entry.startDate) : "Not set"}</td>
                    <td data-label="Roster status"><span className={`pill ${entry.isActive ? "pill-green" : "pill-muted"}`}>{entry.isActive ? "Active" : "Inactive"}</span></td>
                    <td data-label="Assigned active cases">{caseLoad(entry)}</td>
                    {(canManage || canManageOwnGroup) && (
                      <td data-label="Actions" className="roster-row-actions">
                        {canManage && <Link className="govbtn-outline" href={`/dashboard/roster/${entry.id}`}>{!entry.unit && !canManageAll ? "Assign to my division" : "Edit"}</Link>}
                        {canManageOwnGroup && canManageCriminalGroupRosterEntry(viewerTiers, viewerDivision, viewerGroup, entry.unit, entry.divisionGroup) && <form action={updateCriminalGroupAssignment} className="roster-group-assignment"><input type="hidden" name="id" value={entry.id} /><label htmlFor={`group-row-${entry.id}`}>Criminal group</label><select id={`group-row-${entry.id}`} name="divisionGroup" defaultValue={entry.divisionGroup ?? ""}><option value="">Unassigned</option><option value={viewerGroup!}>Group {viewerGroup}</option></select><button className="govbtn-outline" type="submit">Save</button></form>}
                        {canManage && (canManageAll || entry.unit === (user?.division ?? null)) && (entry.robloxSynced ? <span className="hint">Membership managed by Roblox</span> : <>
                          <form action={setRosterActive}><input type="hidden" name="id" value={entry.id}/><input type="hidden" name="isActive" value={String(!entry.isActive)}/><button className="linklike" type="submit">Mark {entry.isActive ? "inactive" : "active"}</button></form>
                          <RemoveButton id={entry.id} action={removeRosterEntry} />
                        </>)}
                      </td>
                    )}
                  </tr>
              ))}
            </tbody>
          </table>
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

      <form method="get" className="formbox roster-filters" aria-label="Filter staff roster">
        <div className="field"><label htmlFor="roster-search">Search name or Discord ID</label><input id="roster-search" name="q" defaultValue={filters.q} /></div>
        <div className="field"><label htmlFor="roster-rank">Rank</label><select id="roster-rank" name="rank" defaultValue={filters.rank ?? ""}><option value="">All ranks</option>{ranks.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
        <div className="field"><label htmlFor="roster-unit">Division</label><select id="roster-unit" name="unit" defaultValue={filters.unit ?? ""}><option value="">All divisions</option>{divisions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></div>
        <div className="field"><label htmlFor="roster-group">Criminal group</label><select id="roster-group" name="group" defaultValue={filters.group ?? ""}><option value="">All visible groups</option>{(canViewOwnGroup ? [user.divisionGroup!] : ["1", "2"]).map((group) => <option key={group} value={group}>Group {group}</option>)}</select></div>
        <div className="field"><label htmlFor="roster-active">Roster status</label><select id="roster-active" name="active" defaultValue={filters.active ?? "all"}><option value="all">All</option><option value="yes">Active</option><option value="no">Inactive</option></select></div>
        <button className="govbtn" type="submit">Filter</button><Link className="govbtn-outline" href="/dashboard/roster">Clear</Link>
      </form>

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
              <div className="field">
                <label htmlFor="unit">
                  Unit / Bureau <span className="hint">(optional. Determines which leadership position a leadership rank fills)</span>
                </label>
                <select id="unit" name="unit" defaultValue="">
                  <option value="">No unit set</option>
                  {divisions.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="divisionGroup">Criminal Division group <span className="hint">(optional; assigns a supervising SADA group)</span></label>
                <select id="divisionGroup" name="divisionGroup" defaultValue=""><option value="">No group</option><option value="1">Group 1</option><option value="2">Group 2</option></select>
              </div>
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

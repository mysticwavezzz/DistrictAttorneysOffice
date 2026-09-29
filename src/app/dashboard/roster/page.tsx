import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { RANKS, isLeadershipRank } from "@/config/ranks";
import { UNITS } from "@/config/units";
import { addRosterEntry, removeRosterEntry, setRosterActive } from "./actions";
import { RemoveButton } from "@/components/remove-button";
import { FormWithPendingSubmit } from "@/components/form-with-pending-submit";
import { getSiteConfiguration } from "@/lib/site-settings";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

type RosterEntry = Awaited<ReturnType<typeof prisma.rosterEntry.findMany>>[number];

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ q?: string; rank?: string; unit?: string; active?: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const canManage = hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE);
  const divisions = await getSiteConfiguration("divisions", UNITS);
  const ranks = await getSiteConfiguration("ranks", RANKS);
  const filters = await searchParams;

  let entries: RosterEntry[] = [];
  let activeDiscordIds = new Set<string>();
  try {
    entries = await prisma.rosterEntry.findMany({ orderBy: { name: "asc" } });
    const activeUsers = await prisma.user.findMany({
      where: { tiers: { not: "" } },
      select: { discordUserId: true },
    });
    activeDiscordIds = new Set(activeUsers.map((u) => u.discordUserId));
  } catch (error) {
    console.error("Failed to load roster", error);
  }
  const filteredEntries = entries.filter((entry) =>
    (filters.active !== "yes" || entry.isActive) && (filters.active !== "no" || !entry.isActive) &&
    (!filters.q || `${entry.name} ${entry.discordUserId ?? ""}`.toLowerCase().includes(filters.q.toLowerCase())) &&
    (!filters.rank || entry.rank === filters.rank) && (!filters.unit || entry.unit === filters.unit)
  );
  const vacantUnits = new Set(divisions.filter((division) => !entries.some((entry) => entry.unit === division.value)).map((division) => division.value));

  const groups: { key: string; label: string; description?: string; entries: RosterEntry[] }[] = [
    ...divisions.map((u) => ({ key: u.value, label: u.label, description: u.description, entries: [] as RosterEntry[] })),
    { key: "", label: "Unassigned", entries: [] as RosterEntry[] },
  ];
  const unassignedGroup = groups[groups.length - 1]!;
  for (const entry of filteredEntries) {
    const group = groups.find((g) => g.key === (entry.unit ?? "")) ?? unassignedGroup;
    group.entries.push(entry);
  }

  function renderGroup(group: (typeof groups)[number]) {
    if (group.entries.length === 0) return null;
    return (
      <div key={group.key} style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 4 }}>{group.label}</h3>
        {group.description && <p className="note-inline">{group.description}</p>}
        <div className="roster-cards">
          {group.entries.map((entry) => <article className="roster-card" key={`card-${entry.id}`}>
            {entry.imageUrl && <img src={entry.imageUrl} alt="" loading="lazy" />}
            <h4>{entry.name}</h4><p>{entry.rank ?? "Rank not set"}</p>
            <span className={`pill ${entry.isActive ? "pill-green" : "pill-muted"}`}>{entry.isActive ? "Roster active" : "Roster inactive"}</span>
            <span className={`pill ${entry.discordUserId ? (activeDiscordIds.has(entry.discordUserId) ? "pill-green" : "pill-red") : "pill-muted"}`}>{entry.discordUserId ? (activeDiscordIds.has(entry.discordUserId) ? "Active" : "Inactive") : "Not linked"}</span>
            {canManage && <p><Link href={`/dashboard/roster/${entry.id}`}>Edit profile</Link></p>}
          </article>)}
        </div>
        <div className="tablewrap">
          <table className="stat mobile-cards">
            <thead>
              <tr>
                <th>Name</th>
                <th>Rank</th>
                <th>Discord</th>
                <th>Start Date</th>
                <th>Roster status</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {group.entries.map((entry) => {
                const stale = entry.discordUserId ? !activeDiscordIds.has(entry.discordUserId) : false;
                return (
                  <tr key={entry.id}>
                    <td data-label="Name">{entry.name}</td>
                    <td data-label="Rank">
                      {entry.rank ?? "—"}{" "}
                      {isLeadershipRank(entry.rank) && <span className="pill pill-gold">Leadership</span>}
                    </td>
                    <td data-label="Discord" className="mono">
                      {entry.discordUserId ?? "—"}{" "}
                      {stale && (
                        <span className="pill pill-red" title="No active staff tier found for this Discord ID">
                          Stale
                        </span>
                      )}
                    </td>
                    <td data-label="Start date">{entry.startDate ? dateFormatter.format(entry.startDate) : "—"}</td>
                    <td data-label="Roster status"><span className={`pill ${entry.isActive ? "pill-green" : "pill-muted"}`}>{entry.isActive ? "Active" : "Inactive"}</span></td>
                    {canManage && (
                      <td data-label="Actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <Link href={`/dashboard/roster/${entry.id}`}>Edit</Link>
                        <form action={setRosterActive}><input type="hidden" name="id" value={entry.id}/><input type="hidden" name="isActive" value={String(!entry.isActive)}/><button className="linklike" type="submit">Mark {entry.isActive ? "inactive" : "active"}</button></form>
                        <RemoveButton id={entry.id} action={removeRosterEntry} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Staff Roster</h1>

      <form method="get" className="formbox roster-filters" aria-label="Filter staff roster">
        <div className="field"><label htmlFor="roster-search">Search name or Discord ID</label><input id="roster-search" name="q" defaultValue={filters.q} /></div>
        <div className="field"><label htmlFor="roster-rank">Rank</label><select id="roster-rank" name="rank" defaultValue={filters.rank ?? ""}><option value="">All ranks</option>{ranks.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
        <div className="field"><label htmlFor="roster-unit">Division</label><select id="roster-unit" name="unit" defaultValue={filters.unit ?? ""}><option value="">All divisions</option>{divisions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></div>
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
                  Unit / Bureau <span className="hint">(optional — determines which leadership position a leadership rank fills)</span>
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
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="discordUserId">
                  Discord User ID <span className="hint">(optional)</span>
                </label>
                <input type="text" id="discordUserId" name="discordUserId" maxLength={50} />
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
                Profile Picture URL <span className="hint">(optional — shown on Office Info if leadership)</span>
              </label>
              <input type="text" id="imageUrl" name="imageUrl" maxLength={2000} placeholder="https://" />
            </div>
            <div className="field">
              <label htmlFor="about">
                About Me <span className="hint">(optional — shown on Office Info if leadership)</span>
              </label>
              <textarea id="about" name="about" rows={3} maxLength={2000} />
            </div>
          </FormWithPendingSubmit>
        </>
      )}
    </div>
  );
}

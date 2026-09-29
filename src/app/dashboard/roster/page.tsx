import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { RANKS, isLeadershipRank } from "@/config/ranks";
import { addRosterEntry, removeRosterEntry } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function RosterPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const canManage = hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE);

  let entries: Awaited<ReturnType<typeof prisma.rosterEntry.findMany>> = [];
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

  return (
    <div>
      <h1>Staff Roster</h1>

      <div className="tablewrap">
        <table className="stat">
          <thead>
            <tr>
              <th>Name</th>
              <th>Position</th>
              <th>Rank</th>
              <th>Badge #</th>
              <th>Discord</th>
              <th>Start Date</th>
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                  No roster entries yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const stale = entry.discordUserId ? !activeDiscordIds.has(entry.discordUserId) : false;
                return (
                  <tr key={entry.id}>
                    <td>{entry.name}</td>
                    <td>{entry.position}</td>
                    <td>
                      {entry.rank ?? "—"}{" "}
                      {isLeadershipRank(entry.rank) && <span className="pill pill-gold">Leadership</span>}
                    </td>
                    <td>{entry.badgeNumber ?? "—"}</td>
                    <td className="mono">
                      {entry.discordUserId ?? "—"}{" "}
                      {stale && (
                        <span className="pill pill-red" title="No active staff tier found for this Discord ID">
                          Stale
                        </span>
                      )}
                    </td>
                    <td>{entry.startDate ? dateFormatter.format(entry.startDate) : "—"}</td>
                    {canManage && (
                      <td style={{ display: "flex", gap: 10 }}>
                        <Link href={`/dashboard/roster/${entry.id}`}>Edit</Link>
                        <form action={removeRosterEntry}>
                          <input type="hidden" name="id" value={entry.id} />
                          <button type="submit" className="linklike">
                            Remove
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {canManage && (
        <>
          <h2>Add Employee</h2>
          <form action={addRosterEntry} className="formbox">
            <div className="field-row">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input type="text" id="name" name="name" required maxLength={100} />
              </div>
              <div className="field">
                <label htmlFor="position">Position</label>
                <input type="text" id="position" name="position" required maxLength={100} />
              </div>
              <div className="field">
                <label htmlFor="rank">
                  Rank <span className="hint">(optional — CADA and above appear as office leadership)</span>
                </label>
                <select id="rank" name="rank" defaultValue="">
                  <option value="">No rank set</option>
                  {RANKS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="badgeNumber">
                  Badge # <span className="hint">(optional)</span>
                </label>
                <input type="text" id="badgeNumber" name="badgeNumber" maxLength={30} />
              </div>
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
            <button type="submit" className="govbtn">
              Add Employee
            </button>
          </form>
        </>
      )}
    </div>
  );
}

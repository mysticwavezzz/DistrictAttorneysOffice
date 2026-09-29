import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { RANKS } from "@/config/ranks";
import { updateRosterEntry, removeRosterEntry } from "../actions";

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export default async function EditRosterEntryPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE)) {
    redirect("/login?error=forbidden");
  }

  const entry = await prisma.rosterEntry.findUnique({ where: { id: params.id } });
  if (!entry) notFound();

  return (
    <div>
      <h1>Edit Roster Entry</h1>

      <form action={updateRosterEntry} className="formbox">
        <input type="hidden" name="id" value={entry.id} />
        <div className="field-row">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input type="text" id="name" name="name" required maxLength={100} defaultValue={entry.name} />
          </div>
          <div className="field">
            <label htmlFor="position">Position</label>
            <input
              type="text"
              id="position"
              name="position"
              required
              maxLength={100}
              defaultValue={entry.position}
            />
          </div>
          <div className="field">
            <label htmlFor="rank">
              Rank <span className="hint">(optional — CADA and above appear as office leadership)</span>
            </label>
            <select id="rank" name="rank" defaultValue={entry.rank ?? ""}>
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
            <input
              type="text"
              id="badgeNumber"
              name="badgeNumber"
              maxLength={30}
              defaultValue={entry.badgeNumber ?? ""}
            />
          </div>
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
            <label htmlFor="startDate">
              Start Date <span className="hint">(optional)</span>
            </label>
            <input type="date" id="startDate" name="startDate" defaultValue={toDateInputValue(entry.startDate)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="imageUrl">
            Profile Picture URL <span className="hint">(optional — shown on Office Info if leadership)</span>
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
            About Me <span className="hint">(optional — shown on Office Info if leadership)</span>
          </label>
          <textarea id="about" name="about" rows={3} maxLength={2000} defaultValue={entry.about ?? ""} />
        </div>
        <button type="submit" className="govbtn">
          Save Changes
        </button>
      </form>

      <form action={removeRosterEntry} style={{ marginTop: 16 }}>
        <input type="hidden" name="id" value={entry.id} />
        <button type="submit" className="govbtn" style={{ background: "var(--down)", borderColor: "#6b2018" }}>
          Remove from Roster
        </button>
      </form>
    </div>
  );
}

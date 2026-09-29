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

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export default async function EditRosterEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE)) {
    redirect("/login?error=forbidden");
  }

  const entry = await prisma.rosterEntry.findUnique({ where: { id } });
  if (!entry) notFound();
  const [ranks, divisions] = await Promise.all([
    getSiteConfiguration("ranks", RANKS),
    getSiteConfiguration("divisions", UNITS),
  ]);

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
            <input type="text" id="name" name="name" required maxLength={100} defaultValue={entry.name} />
          </div>
          <div className="field">
            <label htmlFor="rank">Rank</label>
            <select id="rank" name="rank" defaultValue={entry.rank ?? ""} required>
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
            <select id="unit" name="unit" defaultValue={entry.unit ?? ""}>
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

      <RemoveButton
        id={entry.id}
        action={removeRosterEntry}
        label="Remove from Roster"
        pendingLabel="Removing…"
        className="govbtn"
        style={{ background: "var(--down)", borderColor: "#6b2018" }}
        formStyle={{ marginTop: 16 }}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { AOPC_TARGET_UNITS, UNIT_LEADER_RANK } from "@/config/units";
import { localUser } from "@/lib/case-access";
import { submitAopc, reviewAopc } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const STATUS_COLORS: Record<string, string> = {
  PENDING: "pill-gold",
  ACCEPTED: "pill-green",
  REJECTED: "pill-red",
};

export default async function AffidavitsPage() {
  const session = await auth();
  const canSubmit = session?.user && hasCapability(session.user.tiers, CAPABILITIES.AOPC_SUBMIT);
  const canReview = session?.user && hasCapability(session.user.tiers, CAPABILITIES.AOPC_REVIEW);
  if (!session?.user || (!canSubmit && !canReview)) {
    redirect("/login?error=forbidden");
  }

  const user = await localUser(session.user.discordUserId);

  const leaderRanks = AOPC_TARGET_UNITS.map((unit) => UNIT_LEADER_RANK[unit]).filter(
    (rank): rank is string => Boolean(rank)
  );
  const leads = await prisma.rosterEntry.findMany({
    where: { rank: { in: leaderRanks } },
    select: { unit: true, rank: true, name: true },
  });
  const leadByUnit = new Map(leads.map((l) => [l.unit, l.name]));

  const aopcs = await prisma.aopc.findMany({
    where: canReview ? {} : { submittedById: user?.id },
    orderBy: { createdAt: "desc" },
    include: { submittedBy: true, reviewedBy: true },
    take: 50,
  });

  const pending = aopcs.filter((a) => a.status === "PENDING");
  const decided = aopcs.filter((a) => a.status !== "PENDING");

  function renderAopc(a: (typeof aopcs)[number]) {
    const leadName = leadByUnit.get(a.targetUnit);
    return (
      <div key={a.id} className="formbox" style={{ marginBottom: 10 }}>
        <p className="eyebrow">
          {a.targetUnit} &middot; submitted by {a.submittedBy.displayName} &middot; {dateFormatter.format(a.createdAt)}
          {leadName ? ` — Unit lead: ${leadName}` : " — Unit lead: Vacant"}
        </p>
        <h3 style={{ marginTop: 0 }}>{a.title}</h3>
        <p style={{ fontSize: 12 }}>Subject: {a.subject}</p>
        <p style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{a.narrative}</p>

        {a.status === "PENDING" ? (
          canReview && (
            <form action={reviewAopc} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
              <input type="hidden" name="id" value={a.id} />
              <input
                type="text"
                name="note"
                placeholder="Review note (optional)"
                maxLength={1000}
                style={{ flex: "1 1 220px", padding: "6px 8px", border: "1px solid var(--bd)" }}
              />
              <button type="submit" name="decision" value="ACCEPT" className="govbtn">
                Accept &amp; Open Case
              </button>
              <button
                type="submit"
                name="decision"
                value="REJECT"
                className="govbtn"
                style={{ background: "var(--down)", borderColor: "#6b2018" }}
              >
                Reject
              </button>
            </form>
          )
        ) : (
          <p style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
            <span className={`pill ${STATUS_COLORS[a.status] ?? "pill-muted"}`}>{a.status}</span>{" "}
            by {a.reviewedBy?.displayName ?? "—"}
            {a.reviewedAt ? ` on ${dateFormatter.format(a.reviewedAt)}` : ""}
            {a.reviewNote ? ` — "${a.reviewNote}"` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1>Affidavits of Probable Cause</h1>
      <p className="lede">
        Affidavits of Probable Cause referred to the Criminal Division or the Public Integrity
        Bureau by the Special Investigations Bureau.
      </p>

      <h2>Pending ({pending.length})</h2>
      {pending.length === 0 ? (
        <div className="message">Nothing waiting on review.</div>
      ) : (
        pending.map(renderAopc)
      )}

      <h2>{canReview ? "Recently Reviewed" : "Your Past Submissions"}</h2>
      {decided.length === 0 ? (
        <div className="message">Nothing here yet.</div>
      ) : (
        decided.slice(0, 15).map(renderAopc)
      )}

      {canSubmit && (
        <>
          <h2>Submit a New Affidavit of Probable Cause</h2>
          <form action={submitAopc} className="formbox">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input type="text" id="title" name="title" required maxLength={200} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="targetUnit">Send To</label>
                <select id="targetUnit" name="targetUnit" defaultValue={AOPC_TARGET_UNITS[0]}>
                  {AOPC_TARGET_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="subject">Subject</label>
                <input type="text" id="subject" name="subject" required maxLength={200} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="narrative">Narrative</label>
              <textarea id="narrative" name="narrative" required rows={8} maxLength={8000} />
            </div>
            <button type="submit" className="govbtn">
              Submit Affidavit
            </button>
          </form>
        </>
      )}
    </div>
  );
}

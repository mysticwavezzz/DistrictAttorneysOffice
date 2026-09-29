import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { reviewCaseRequest } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function CaseRequestsPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS)) {
    redirect("/login?error=forbidden");
  }

  const requests = await prisma.caseActionRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: { requestedBy: true, reviewedBy: true, case: true },
    take: 50,
  });

  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  function renderRequest(r: (typeof requests)[number]) {
    const data = JSON.parse(r.proposedData) as Record<string, string | undefined>;
    return (
      <div key={r.id} className="formbox" style={{ marginBottom: 10 }}>
        <p className="eyebrow">
          {r.kind === "CREATE" ? "New Case" : "Edit"} &middot; proposed by {r.requestedBy.displayName} &middot;{" "}
          {dateFormatter.format(r.createdAt)}
        </p>
        <h3 style={{ marginTop: 0 }}>
          {data.title} <span className="mono">({data.caseNumber})</span>
        </h3>
        <p style={{ fontSize: 12 }}>
          Type: {data.type || "—"} &middot; Stage: {data.stage || "—"}
        </p>
        {data.summary && <p style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{data.summary}</p>}

        {r.status === "PENDING" ? (
          <form action={reviewCaseRequest} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <input type="hidden" name="id" value={r.id} />
            <input
              type="text"
              name="note"
              placeholder="Review note (optional)"
              maxLength={1000}
              style={{ flex: "1 1 220px", padding: "6px 8px", border: "1px solid var(--bd)" }}
            />
            <button type="submit" name="decision" value="APPROVE" className="govbtn">
              Approve
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
        ) : (
          <p style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
            <span className={`pill ${r.status === "APPROVED" ? "pill-green" : "pill-red"}`}>{r.status}</span>{" "}
            by {r.reviewedBy?.displayName ?? "—"}
            {r.reviewedAt ? ` on ${dateFormatter.format(r.reviewedAt)}` : ""}
            {r.reviewNote ? ` — "${r.reviewNote}"` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1>Case Requests</h1>
      <p className="lede">Case creations and edits proposed by paralegal staff, awaiting review.</p>

      <h2>Pending ({pending.length})</h2>
      {pending.length === 0 ? (
        <div className="message">Nothing waiting on review.</div>
      ) : (
        pending.map(renderRequest)
      )}

      <h2>Recently Reviewed</h2>
      {decided.length === 0 ? (
        <div className="message">No reviewed requests yet.</div>
      ) : (
        decided.slice(0, 15).map(renderRequest)
      )}
    </div>
  );
}

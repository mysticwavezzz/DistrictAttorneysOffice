import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { reviewCaseRequest } from "./actions";
import { TIER_DEFINITIONS } from "@/lib/permissions/tiers";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function CaseRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS)) {
    redirect("/login?error=forbidden");
  }

  const requests = await prisma.caseActionRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: { requestedBy: true, reviewedBy: true, case: true },
    take: 50,
  });
  const selectedStatus = (await searchParams).status ?? "all";
  const visibleRequests = selectedStatus === "all" ? requests : requests.filter((request) => request.status === selectedStatus.toUpperCase());

  const pending = visibleRequests.filter((r) => r.status === "PENDING");
  const decided = visibleRequests.filter((r) => r.status !== "PENDING");

  function renderRequest(r: (typeof requests)[number]) {
    const data = JSON.parse(r.proposedData) as Record<string, string | undefined>;
    const requesterTiers = r.requestedBy.tiers.split(",").filter((tier) => tier in TIER_DEFINITIONS);
    const comparedFields = [
      ["Case title", "title"], ["Case number", "caseNumber"], ["Type", "type"],
      ["Status", "stage"], ["Summary", "summary"],
    ] as const;
    return (
      <div key={r.id} className="formbox" style={{ marginBottom: 10 }}>
        <p className="eyebrow">
          {r.kind === "CREATE" ? "New Case" : "Edit"} &middot; proposed by {r.requestedBy.displayName}
          {requesterTiers.length > 0 && ` (${requesterTiers.map((tier) => TIER_DEFINITIONS[tier as keyof typeof TIER_DEFINITIONS].label).join(", ")})`} &middot;{" "}
          {dateFormatter.format(r.createdAt)}
        </p>
        <h3 style={{ marginTop: 0 }}>
          {data.title} <span className="mono">({data.caseNumber})</span>
        </h3>
        <p style={{ fontSize: 12 }}>
          Type: {data.type || "Not set"} &middot; Stage: {data.stage || "Not set"}
        </p>
        {data.summary && <p style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{data.summary}</p>}

        {r.kind === "EDIT" && r.case && (
          <div className="tablewrap">
            <table className="stat">
              <thead><tr><th scope="col">Field</th><th scope="col">Current</th><th scope="col">Proposed</th></tr></thead>
              <tbody>{comparedFields.map(([label, key]) => {
                const current = key === "title" ? r.case!.title : key === "caseNumber" ? r.case!.caseNumber : key === "type" ? r.case!.type : key === "stage" ? r.case!.stage : r.case!.summary;
                const proposed = data[key] ?? "";
                const changed = (current ?? "") !== proposed;
                return <tr key={key} className={changed ? "change-highlight" : undefined}><th scope="row">{label}{changed && <span className="pill pill-gold">Changed</span>}</th><td>{current || "Not set"}</td><td>{proposed || "Not set"}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}

        {r.status === "PENDING" ? (
          <form action={reviewCaseRequest} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <input type="hidden" name="id" value={r.id} />
          <input
            type="text"
            name="note"
            aria-label="Review note, required when rejecting"
            placeholder="Review note (required when rejecting)"
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
            by {r.reviewedBy?.displayName ?? "Not available"}
            {r.reviewedAt ? ` on ${dateFormatter.format(r.reviewedAt)}` : ""}
            {r.reviewNote ? `: "${r.reviewNote}"` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1>Case Requests</h1>
      <p className="lede">Case creations and edits proposed by paralegal staff, awaiting review.</p>
      <nav className="filter-tabs" aria-label="Filter requests by status">
        {[ ["all", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"] ].map(([value, label]) => <Link key={value} href={`/dashboard/cases/requests${value === "all" ? "" : `?status=${value}`}`} aria-current={selectedStatus === value ? "page" : undefined}>{label}</Link>)}
      </nav>

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

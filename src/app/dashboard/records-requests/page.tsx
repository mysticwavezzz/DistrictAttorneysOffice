import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { markRecordsRequestStatus } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const STATUS_COLORS: Record<string, string> = {
  NEW: "pill-gold",
  IN_PROGRESS: "pill-navy",
  FULFILLED: "pill-green",
  DENIED: "pill-red",
};

export default async function RecordsRequestsPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.REQUESTS_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const requests = await prisma.recordsRequest.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <h1>Public Records Requests</h1>

      {requests.length === 0 ? (
        <div className="message">No records requests yet.</div>
      ) : (
        requests.map((r) => (
          <div key={r.id} className="formbox" style={{ marginBottom: 10 }}>
            <p className="eyebrow">
              {dateFormatter.format(r.createdAt)} &middot;{" "}
              <span className={`pill ${STATUS_COLORS[r.status] ?? "pill-muted"}`}>{r.status}</span>
            </p>
            <h3 style={{ marginTop: 0 }}>{r.name}</h3>
            <p style={{ fontSize: 12 }}>Contact: {r.contact}</p>
            <p style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{r.details}</p>

            <form action={markRecordsRequestStatus} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="hidden" name="id" value={r.id} />
              <select name="status" defaultValue={r.status}>
                <option value="NEW">New</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="FULFILLED">Fulfilled</option>
                <option value="DENIED">Denied</option>
              </select>
              <button type="submit" className="govbtn-outline" style={{ color: "var(--link)", border: "1px solid var(--bd)" }}>
                Update Status
              </button>
            </form>
          </div>
        ))
      )}
    </div>
  );
}

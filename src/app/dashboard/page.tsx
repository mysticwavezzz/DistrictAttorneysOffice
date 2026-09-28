import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TIER_DEFINITIONS } from "@/lib/permissions";
import { formatCaseStatus } from "@/lib/case-status";

export default async function DashboardOverviewPage() {
  const session = await auth();
  const tiers = session!.user.tiers;

  let caseCounts: { status: string; count: number }[] = [];
  try {
    const grouped = await prisma.case.groupBy({ by: ["status"], _count: { _all: true } });
    caseCounts = grouped.map((g) => ({ status: g.status, count: g._count._all }));
  } catch (error) {
    console.error("Failed to load case counts", error);
  }

  return (
    <div>
      <p className="eyebrow">Staff Portal</p>
      <h1>Welcome, {session!.user.displayName}</h1>
      <p className="subtitle">
        Staff role{tiers.length === 1 ? "" : "s"}:{" "}
        {tiers.length > 0
          ? tiers.map((t) => TIER_DEFINITIONS[t].label).join(", ")
          : "No recognized staff role"}
      </p>

      <h2>Case Load</h2>
      <div className="cards">
        {caseCounts.length === 0 ? (
          <div className="message">No case data available yet.</div>
        ) : (
          caseCounts.map((c) => (
            <div key={c.status} className="card">
              <span className="card-label">{formatCaseStatus(c.status)}</span>
              <span className="card-value">{c.count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

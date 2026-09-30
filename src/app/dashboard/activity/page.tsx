import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function ActivityLogPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ACTIVITY_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const entries = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1>Admin Activity Log</h1>
      <p className="lede">Roster and release changes made by staff.</p>

      {entries.length === 0 ? (
        <div className="message">No activity recorded yet.</div>
      ) : (
        <div className="tablewrap">
          <table className="stat mobile-cards">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td data-label="When">{dateFormatter.format(e.createdAt)}</td>
                  <td data-label="Who">{e.actorName}</td>
                  <td data-label="Action">
                    {e.action} {e.targetType}
                  </td>
                  <td data-label="Target">{e.targetLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

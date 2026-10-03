import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { CAPABILITIES } from "@/lib/permissions/capabilities";
import { hasCapability } from "@/lib/permissions/resolve";

export const metadata: Metadata = {
  title: "Action Debug",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ActionDebugPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) redirect("/login?error=forbidden");

  const params = await searchParams;
  const actionId = first(params.actionId)?.trim().slice(0, 100) ?? "";
  const actor = first(params.actor)?.trim().slice(0, 120) ?? "";
  const action = first(params.action)?.trim().slice(0, 160) ?? "";
  const outcome = first(params.outcome)?.trim() ?? "";
  const from = first(params.from) ?? "";
  const to = first(params.to) ?? "";
  const detailId = first(params.debugId)?.trim().slice(0, 100) ?? "";
  const page = Math.max(1, Math.min(100_000, Number(first(params.page)) || 1));
  const filters: Prisma.ActionDebugLogWhereInput = {};
  if (actionId) filters.actionId = { contains: actionId };
  if (actor) filters.actorName = { contains: actor };
  if (action) filters.actionName = { contains: action };
  if (outcome && ["SUCCESS", "REDIRECTED", "FAILED"].includes(outcome)) filters.outcome = outcome;
  const createdAt: Prisma.DateTimeFilter = {};
  if (from && !Number.isNaN(Date.parse(from))) createdAt.gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) createdAt.lte = new Date(`${to}T23:59:59.999`);
  if (createdAt.gte || createdAt.lte) filters.createdAt = createdAt;

  const [total, entries, selected] = await Promise.all([
    prisma.actionDebugLog.count({ where: filters }),
    prisma.actionDebugLog.findMany({ where: filters, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50 }),
    detailId ? prisma.actionDebugLog.findUnique({ where: { actionId: detailId } }) : Promise.resolve(null),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / 50));
  const queryString = new URLSearchParams(Object.entries({ actionId, actor, action, outcome, from, to }).filter(([, value]) => value)).toString();

  return <main className="paper" style={{ maxWidth: 1180, margin: "24px auto" }}>
    <h1>Action Debug</h1>
    <p className="note-inline">Private diagnostics for user-triggered actions. Form contents, credentials, tip narratives, and document data are not stored here.</p>
    <form method="get" className="formbox" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
      <div className="field"><label htmlFor="actionId">Action ID</label><input id="actionId" name="actionId" defaultValue={actionId} placeholder="ACT-…" /></div>
      <div className="field"><label htmlFor="actor">Actor</label><input id="actor" name="actor" defaultValue={actor} placeholder="Roblox username" /></div>
      <div className="field"><label htmlFor="action">Action name</label><input id="action" name="action" defaultValue={action} placeholder="createCase" /></div>
      <div className="field"><label htmlFor="outcome">Outcome</label><select id="outcome" name="outcome" defaultValue={outcome}><option value="">Any outcome</option><option value="SUCCESS">Success</option><option value="REDIRECTED">Redirected</option><option value="FAILED">Failed</option></select></div>
      <div className="field"><label htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={from} /></div>
      <div className="field"><label htmlFor="to">Through</label><input id="to" name="to" type="date" defaultValue={to} /></div>
      <div style={{ display: "flex", alignItems: "end", gap: 8 }}><button className="govbtn" type="submit">Search actions</button><Link className="govbtn-outline" href="/debug">Clear</Link></div>
    </form>

    {selected && <section className="formbox" aria-labelledby="report-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
        <div><h2 id="report-title">Action report</h2><code>{selected.actionId}</code></div>
        <Link className="govbtn-outline" href={`/debug?${queryString}`}>Close report</Link>
      </div>
      <div className="tablewrap"><table className="stat"><tbody>
        <tr><th>Action</th><td>{selected.actionName}</td></tr>
        <tr><th>Request</th><td>{selected.requestMethod ?? "Unknown"}{selected.requestPath ? ` · ${selected.requestPath}` : ""}</td></tr>
        <tr><th>Actor</th><td>{selected.actorName ?? "Unauthenticated"}{selected.actorId ? ` · account ${selected.actorId}` : ""}{selected.identityProvider ? ` · ${selected.identityProvider}` : ""}</td></tr>
        <tr><th>Permission context</th><td>{(() => { try { return (JSON.parse(selected.permissionTiers) as string[]).join(", ") || "No permission tiers"; } catch { return "Unavailable"; } })()}</td></tr>
        <tr><th>Outcome</th><td>{selected.outcome}</td></tr>
        <tr><th>Timeline</th><td>{selected.startedAt.toLocaleString()} → {new Date(selected.startedAt.getTime() + selected.durationMs).toLocaleString()} ({selected.durationMs} ms)</td></tr>
        <tr><th>Duration</th><td>{selected.durationMs} ms</td></tr>
        <tr><th>Related record</th><td>{selected.targetReference ?? "Not captured"}</td></tr>
        {selected.errorName && <tr><th>Error type</th><td>{selected.errorName}</td></tr>}
      </tbody></table></div>
      {selected.errorStack && <details className="dashboard-fold" open><summary><span className="dashboard-fold-title">Server stack frames</span></summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 420, overflow: "auto" }}>{selected.errorStack}</pre></details>}
    </section>}

    <h2>Recent actions <span className="note-inline">({total})</span></h2>
    {entries.length ? <div className="tablewrap"><table className="stat"><thead><tr><th>Action ID</th><th>Action</th><th>Actor</th><th>Outcome</th><th>Time</th><th>Duration</th></tr></thead><tbody>
      {entries.map((entry) => <tr key={entry.actionId}>
        <td className="mono"><code>{entry.actionId}</code> <Link className="govbtn-outline" href={`/debug?${queryString}${queryString ? "&" : ""}debugId=${encodeURIComponent(entry.actionId)}`}>[DEBUG]</Link></td><td>{entry.actionName}</td><td>{entry.actorName ?? "Unauthenticated"}</td><td><span className={`pill ${entry.outcome === "FAILED" ? "pill-red" : entry.outcome === "SUCCESS" ? "pill-green" : "pill-muted"}`}>{entry.outcome}</span></td><td>{entry.createdAt.toLocaleString()}</td><td>{entry.durationMs} ms</td>
      </tr>)}
    </tbody></table></div> : <p>No matching action records.</p>}
    <p>Page {page} of {pageCount}{page > 1 ? <> · <Link href={`/debug?${queryString}${queryString ? "&" : ""}page=${page - 1}`}>Previous</Link></> : null}{page < pageCount ? <> · <Link href={`/debug?${queryString}${queryString ? "&" : ""}page=${page + 1}`}>Next</Link></> : null}</p>
  </main>;
}

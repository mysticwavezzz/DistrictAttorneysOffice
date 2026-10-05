import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) redirect("/login?error=forbidden");

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const firstDay = since.toISOString().slice(0, 10);
  const rows = await prisma.siteAnalyticsDaily.findMany({ where: { day: { gte: firstDay } }, orderBy: [{ day: "desc" }, { views: "desc" }] });
  const total = rows.reduce((sum, row) => sum + row.views, 0);
  const byPath = new Map<string, number>();
  for (const row of rows) byPath.set(row.path, (byPath.get(row.path) ?? 0) + row.views);

  return <main className="paper analytics-page">
    <p className="eyebrow">Private Control Panel</p><h1>First-party site analytics</h1>
    <p className="lede">Opt-in public page views, aggregated by UTC day and page. No individual visit history, query strings, user accounts, or advertising identifiers are stored.</p>
    <p><Link className="govbtn-outline" href="/98981">Back to site settings</Link></p>
    <section className="analytics-summary" aria-label="Analytics summary">
      <article><span>Views, last 30 days</span><strong>{total.toLocaleString()}</strong></article>
      <article><span>Tracked pages</span><strong>{byPath.size}</strong></article>
      <article><span>Daily aggregates</span><strong>{rows.length.toLocaleString()}</strong></article>
    </section>
    <h2>Views by page</h2>
    {byPath.size ? <div className="tablewrap"><table className="stat mobile-cards"><thead><tr><th scope="col">Page</th><th scope="col">Views</th></tr></thead><tbody>{[...byPath].sort((a, b) => b[1] - a[1]).map(([path, views]) => <tr key={path}><td data-label="Page"><code>{path}</code></td><td data-label="Views">{views.toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="message">No opted-in page views have been recorded yet.</p>}
    <h2>Daily totals</h2>
    {rows.length ? <div className="tablewrap"><table className="stat mobile-cards"><thead><tr><th scope="col">UTC day</th><th scope="col">Page</th><th scope="col">Views</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.day}-${row.path}`}><td data-label="UTC day">{row.day}</td><td data-label="Page"><code>{row.path}</code></td><td data-label="Views">{row.views.toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="message">No daily aggregates yet.</p>}
  </main>;
}

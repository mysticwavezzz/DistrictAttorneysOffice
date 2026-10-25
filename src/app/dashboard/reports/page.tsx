import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { caseVisibilityWhere, localUser } from "@/lib/case-access";
import { getProceduralDeadlines, isCourtDeadlineOverdue } from "@/lib/procedural-deadlines";
import { shareMetadata } from "@/lib/share-metadata";

export const metadata = shareMetadata("Supervisor Reports", "Review case ownership, filing status, workload, and deadlines.", "/dashboard/reports");

export default async function SupervisorReportsPage() {
  const session = await auth();
  if (!session?.user || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_DIVISION))) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const visible = caseVisibilityWhere(session.user.tiers, user.id, user.division, user.divisionGroup);
  if (!visible) redirect("/login?error=forbidden");
  const scope = { AND: [visible, { archived: false, isDraft: false }] };
  const [cases, pendingFilings, pendingRequests, pendingAopcs, latestActivity] = await Promise.all([
    prisma.case.findMany({ where: scope, select: { id: true, caseNumber: true, title: true, type: true, stage: true, division: true, assignedAttorneyId: true, assignedAttorney: { select: { displayName: true } }, createdAt: true, updatedAt: true, courtFiledAt: true, initialFilingDue: true, discGiven: true, discDue: true, pretrial: true, otherDates: true, outcome: true, closedOn: true, appealBy: true, arraignmentAt: true, proofOfServiceAt: true, discoveryOrderAt: true, discoveryRequestedAt: true, motionServedAt: true, verdictAt: true, sentenceAt: true, finalJudgmentAt: true, filings: { select: { isInitial: true, status: true }, take: 20 } }, orderBy: { updatedAt: "desc" }, take: 1500 }),
    prisma.caseFiling.count({ where: { status: "PENDING", case: scope } }),
    prisma.caseActionRequest.count({ where: { status: "PENDING", ...(hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) ? {} : { division: user.division }) } }),
    prisma.aopc.count({ where: { status: "PENDING", ...(hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) ? {} : { targetUnit: user.division ?? "__no_division__" }) } }),
    hasCapability(session.user.tiers, CAPABILITIES.ACTIVITY_VIEW) ? prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }) : Promise.resolve([]),
  ]);
  const unassigned = cases.filter((item) => !item.assignedAttorneyId);
  const unfiled = cases.filter((item) => !item.courtFiledAt);
  const overdue = cases.flatMap((item) => getProceduralDeadlines(item).filter((deadline) => isCourtDeadlineOverdue(deadline.dueDate)).map((deadline) => ({ item, deadline })));
  const workload = new Map<string, { name: string; count: number }>();
  for (const item of cases) {
    if (!item.assignedAttorneyId || !item.assignedAttorney) continue;
    const row = workload.get(item.assignedAttorneyId) ?? { name: item.assignedAttorney.displayName, count: 0 };
    row.count += 1;
    workload.set(item.assignedAttorneyId, row);
  }
  const staffWorkload = [...workload.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return <div className="supervisor-reports-page">
    <p className="eyebrow">Office administration · {user.division ?? "all divisions"}</p><h1>Supervisor reports</h1>
    <p className="lede">Live counts from the case records visible to your account. Use the links to correct assignments and reconcile filing records.</p>
    <div className="report-metric-grid"><Link href="/dashboard/workload"><span>Unassigned open cases</span><strong>{unassigned.length}</strong><small>Open assignment queue ↗</small></Link><Link href="/dashboard/cases?filing=unfiled"><span>Actual court filing not recorded</span><strong>{unfiled.length}</strong><small>Open case docket ↗</small></Link><Link href="/dashboard/cases/calendar?due=overdue"><span>Overdue court deadlines</span><strong>{overdue.length}</strong><small>Review calendar ↗</small></Link><Link href="/dashboard/review"><span>Pending review items</span><strong>{pendingFilings + pendingRequests + pendingAopcs}</strong><small>{pendingFilings} filings · {pendingRequests} case requests · {pendingAopcs} AOPCs ↗</small></Link></div>
    <div className="workbench-columns"><section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Current open workload</p><h2>Cases by attorney</h2></div></div>{staffWorkload.length ? <div className="workload-roster">{staffWorkload.map((item) => <article key={item.name}><span>{item.name}</span><strong>{item.count}</strong><span className="workload-meter"><i style={{ width: `${Math.max(4, Math.min(100, item.count * 8))}%` }}/></span></article>)}</div> : <p className="note-inline">No assigned cases in this scope.</p>}</section>
    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Attention queue</p><h2>Cases needing review</h2></div></div>{unfiled.slice(0, 10).length ? <ul className="report-case-list">{unfiled.slice(0, 10).map((item) => <li key={item.id}><Link href={`/dashboard/cases/${item.id}`}><strong>{item.caseNumber}</strong> · {item.title}</Link><span>{item.assignedAttorney?.displayName ?? "Unassigned"} · {item.stage ?? "No stage"}</span></li>)}</ul> : <p className="note-inline">No unfiled cases in this scope.</p>}<Link className="govbtn-outline" href="/dashboard/cases">View full docket</Link></section></div>
    {hasCapability(session.user.tiers, CAPABILITIES.ACTIVITY_VIEW) && <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Recent changes</p><h2>Office activity</h2></div><Link href="/dashboard/activity">Full activity log</Link></div>{latestActivity.length ? <ul className="report-activity-list">{latestActivity.map((item) => <li key={item.id}><strong>{item.actorName}</strong><span>{item.action} · {item.targetType} {item.targetLabel}</span><time dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })}</time></li>)}</ul> : <p className="note-inline">No activity has been recorded yet.</p>}</section>}
  </div>;
}

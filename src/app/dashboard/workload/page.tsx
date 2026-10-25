import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { caseVisibilityWhere, localUser } from "@/lib/case-access";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";
import { assignFromWorkload } from "../cases/workload-actions";
import { shareMetadata } from "@/lib/share-metadata";

export const metadata = shareMetadata("Case Workload", "Review unassigned cases and attorney workloads.", "/dashboard/workload");
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" });

export default async function WorkloadPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  const session = await auth();
  if (!session?.user || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN_DIVISION))) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const division = hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) ? (user.division ?? undefined) : user.division;
  const visibility = caseVisibilityWhere(session.user.tiers, user.id, user.division, user.divisionGroup);
  if (!visibility) redirect("/login?error=forbidden");
  const filters = await searchParams;
  const q = (filters.q ?? "").trim().slice(0, 100);
  const stage = (filters.stage ?? "").trim();
  const allowedStages = new Set(["Intake", "Investigation", "Pretrial", "Trial", "Sentencing", "Appeal"]);
  const restrictToGroup = session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && user.division === "Criminal Division";
  const queueFilter: Prisma.CaseWhereInput = {
    archived: false,
    isDraft: false,
    assignedAttorneyId: null,
    ...(division ? { division } : {}),
    ...(restrictToGroup ? { divisionGroup: user.divisionGroup ?? "__no_group__" } : {}),
    ...(stage && allowedStages.has(stage) ? { stage } : {}),
    ...(q ? { OR: [{ caseNumber: { contains: q } }, { title: { contains: q } }] } : {}),
  };
  const scope: Prisma.CaseWhereInput = { AND: [visibility, queueFilter] };
  const [cases, attorneys] = await Promise.all([
    prisma.case.findMany({ where: scope, select: { id: true, caseNumber: true, title: true, division: true, divisionGroup: true, type: true, stage: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" }, take: 200 }),
    getDivisionCaseAssignees(division, { divisionGroup: user.divisionGroup, restrictToGroup }),
  ]);
  const groupCounts = division ? await prisma.case.groupBy({ by: ["assignedAttorneyId"], where: { division, archived: false, isDraft: false, assignedAttorneyId: { not: null }, ...(session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && user.division === "Criminal Division" ? { divisionGroup: user.divisionGroup ?? "__no_group__" } : {}) }, _count: { _all: true } }) : [];
  const counts = new Map(groupCounts.flatMap((row) => row.assignedAttorneyId ? [[row.assignedAttorneyId, row._count._all] as const] : []));
  const load = attorneys.map((attorney) => ({ ...attorney, count: counts.get(attorney.id) ?? 0 })).sort((a, b) => a.count - b.count || a.displayName.localeCompare(b.displayName));
  const mean = load.length ? load.reduce((sum, attorney) => sum + attorney.count, 0) / load.length : 0;

  return <div className="workload-page">
    <p className="eyebrow">Supervisor queue · {division ?? "Office-wide"}</p><h1>Case workload</h1>
    <p className="lede">Unassigned cases are listed separately from their submitting officer. Choose an attorney to make an assignment. Workload counts are a guide, not an automatic assignment.</p>
    <div className="workload-summary"><article><span>Unassigned cases</span><strong>{cases.length}</strong></article><article><span>Eligible attorneys</span><strong>{attorneys.length}</strong></article><article><span>Average open load</span><strong>{mean.toFixed(1)}</strong></article><Link className="govbtn-outline" href="/dashboard/reports">Open supervisor reports</Link></div>
    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Assignment remains manual</p><h2>Unassigned case queue</h2></div><Link href="/dashboard/cases?staff=all">Open case docket</Link></div>
      <form className="workload-filter"><div className="field"><label htmlFor="workload-q">Search</label><input id="workload-q" name="q" defaultValue={q} placeholder="Case number or party"/></div><div className="field"><label htmlFor="workload-stage">Case stage</label><select id="workload-stage" name="stage" defaultValue={stage}><option value="">All stages</option>{[...allowedStages].map((value) => <option key={value} value={value}>{value}</option>)}</select></div><button className="govbtn" type="submit">Filter</button></form>
      {cases.length ? <div className="workload-case-list">{cases.map((caseRecord) => {
        const proposed = load.find((attorney) => attorney.count === Math.min(...load.map((item) => item.count)));
        return <article className="workload-case" key={caseRecord.id}><div className="workload-case-info"><p className="eyebrow">{caseRecord.caseNumber} · {caseRecord.divisionGroup ?? "No group"}</p><h3><Link href={`/dashboard/cases/${caseRecord.id}`}>{caseRecord.title}</Link></h3><p>{caseRecord.type ?? "Case type not set"} · {caseRecord.stage ?? "Stage not set"} · opened {dateFormat.format(caseRecord.createdAt)}</p>{proposed && <span className="note-inline">Lowest current open load: {proposed.displayName} ({proposed.count})</span>}</div><form action={assignFromWorkload} className="workload-assign"><input type="hidden" name="caseId" value={caseRecord.id}/><label htmlFor={`assignee-${caseRecord.id}`}>Assign attorney</label><select id={`assignee-${caseRecord.id}`} name="assigneeId" required defaultValue={proposed?.id ?? ""}><option value="" disabled>Select eligible attorney</option>{load.map((attorney) => <option key={attorney.id} value={attorney.id}>{attorney.displayName} · {attorney.count} active cases</option>)}</select><button className="govbtn" type="submit">Assign case</button></form></article>;
      })}</div> : <div className="empty-state"><h2>No matching unassigned cases</h2><p>All visible open cases have an attorney, or the selected filter returned no results.</p></div>}
    </section>
    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Open non-archived cases</p><h2>Attorney caseload</h2></div></div><div className="workload-roster">{load.map((attorney) => <article key={attorney.id}><span>{attorney.displayName}</span><strong>{attorney.count}</strong><span className={`workload-meter${attorney.count <= mean ? " workload-lower" : ""}`} aria-label={`${attorney.count} open cases`}><i style={{ width: `${Math.max(4, Math.min(100, attorney.count * 8))}%` }}/></span></article>)}</div><p className="note-inline">Counts include active, non-draft cases in this assignment scope. Make assignments only after checking qualifications, conflicts, and availability.</p></section>
  </div>;
}

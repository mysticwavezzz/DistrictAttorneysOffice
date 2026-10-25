import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { caseVisibilityWhere, localUser } from "@/lib/case-access";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";
import { buildAssignmentContext, recommendCaseAssignees, type AssignmentLoadCase } from "@/lib/case-assignment-recommendations";
import { getProceduralDeadlines, isCourtDeadlineOverdue } from "@/lib/procedural-deadlines";
import { assignFromWorkload } from "../cases/workload-actions";
import { shareMetadata } from "@/lib/share-metadata";

export const metadata = shareMetadata("Case Workload", "Review attorney workloads, filing gaps, and assignment recommendations.", "/dashboard/workload");
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" });

type WorkloadCase = AssignmentLoadCase & {
  id: string;
  caseNumber: string;
  title: string;
  division: string | null;
  divisionGroup: string | null;
  archived: boolean;
  isDraft: boolean;
  createdAt: Date;
  assignedAttorney: { id: string; displayName: string } | null;
  filings: { status: string; isInitial: boolean }[];
  events: { title: string; startsAt: Date; kind: string }[];
};

function getDeadlineSummary(record: WorkloadCase, now: Date) {
  const deadlines = getProceduralDeadlines(record).map((item) => item.dueDate);
  const overdue = deadlines.filter((date) => isCourtDeadlineOverdue(date, now)).length;
  const upcoming = deadlines.filter((date) => !isCourtDeadlineOverdue(date, now)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const hearing = record.events.find((event) => event.kind === "COURT_HEARING");
  const nextDate = [upcoming, hearing?.startsAt ?? null].filter((date): date is Date => Boolean(date && date.getTime() >= now.getTime())).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return { overdue, nextDate };
}

export default async function WorkloadPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  const session = await auth();
  if (!session?.user || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN_DIVISION))) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const division = hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) ? (user.division ?? undefined) : user.division;
  const visibility = caseVisibilityWhere(session.user.tiers, user.id, user.division, user.divisionGroup);
  if (!visibility) redirect("/login?error=forbidden");
  const filters = await searchParams;
  const q = (filters.q ?? "").trim().slice(0, 100).toLocaleLowerCase();
  const stage = (filters.stage ?? "").trim();
  const allowedStages = new Set(["Intake", "Investigation", "Pretrial", "Trial", "Sentencing", "Appeal"]);
  const restrictToGroup = session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && user.division === "Criminal Division";
  const activeCaseWhere: Prisma.CaseWhereInput = {
    archived: false,
    isDraft: false,
    ...(division ? { division } : {}),
    ...(restrictToGroup ? { divisionGroup: user.divisionGroup ?? "__no_group__" } : {}),
  };
  const scope: Prisma.CaseWhereInput = { AND: [visibility, activeCaseWhere] };
  const historyScope: Prisma.CaseWhereInput = { AND: [visibility, { isDraft: false, ...(division ? { division } : {}), ...(restrictToGroup ? { divisionGroup: user.divisionGroup ?? "__no_group__" } : {}) }] };
  const now = new Date();
  const [records, attorneys, caseHistory] = await Promise.all([
    prisma.case.findMany({
      where: scope,
      select: {
        id: true, caseNumber: true, title: true, type: true, stage: true, division: true, divisionGroup: true,
        assignedAttorneyId: true, assignedAttorney: { select: { id: true, displayName: true } }, createdAt: true,
        archived: true, isDraft: true, initialFilingDue: true, discDue: true, pretrial: true, appealBy: true,
        arraignmentAt: true, proofOfServiceAt: true, discoveryOrderAt: true, discoveryRequestedAt: true,
        motionServedAt: true, verdictAt: true, sentenceAt: true, finalJudgmentAt: true, courtFiledAt: true,
        filings: { select: { status: true, isInitial: true } },
        events: { where: { startsAt: { gte: now }, kind: "COURT_HEARING" }, orderBy: { startsAt: "asc" }, take: 1, select: { title: true, startsAt: true, kind: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 2000,
    }),
    getDivisionCaseAssignees(division, { divisionGroup: user.divisionGroup, restrictToGroup }),
    prisma.case.findMany({ where: historyScope, select: { assignedAttorneyId: true, type: true }, orderBy: { createdAt: "desc" }, take: 5000 }),
  ]);
  const activeCases = records as WorkloadCase[];
  const assignmentContext = buildAssignmentContext(attorneys, activeCases, caseHistory, now);
  const load = recommendCaseAssignees({ type: null, stage: null }, assignmentContext);
  const qFilteredCases = activeCases.filter((record) => !record.assignedAttorneyId && (!stage || !allowedStages.has(stage) || record.stage === stage) && (!q || record.caseNumber.toLocaleLowerCase().includes(q) || record.title.toLocaleLowerCase().includes(q)));
  const eligibleIds = new Set(attorneys.map((attorney) => attorney.id));
  const reassignmentCases = activeCases.filter((record) => record.assignedAttorneyId && !eligibleIds.has(record.assignedAttorneyId));
  const overdueFilingCases = activeCases.filter((record) => !record.courtFiledAt && record.initialFilingDue && isCourtDeadlineOverdue(record.initialFilingDue, now));
  const filingGaps = activeCases.filter((record) => record.filings.some((filing) => filing.isInitial && (filing.status === "PENDING" || (filing.status === "ACCEPTED" && !record.courtFiledAt))));
  const mean = load.length ? load.reduce((sum, attorney) => sum + attorney.activeCases, 0) / load.length : 0;

  return <div className="workload-page">
    <p className="eyebrow">Supervisor queue · {division ?? "Office-wide"}</p><h1>Case workload</h1>
    <p className="lede">Assignment suggestions account for active caseload, procedural deadlines, prior cases of the same type, attorney rank for later-stage matters, and division group eligibility. They are recommendations for a supervisor to review.</p>
    <div className="workload-summary workload-summary-wide">
      <article><span>Unassigned cases</span><strong>{qFilteredCases.length}</strong></article>
      <article><span>Eligible attorneys</span><strong>{attorneys.length}</strong></article>
      <article><span>Overdue initial filings</span><strong>{overdueFilingCases.length}</strong></article>
      <article><span>Initial filing workflow gaps</span><strong>{filingGaps.length}</strong></article>
      <article><span>Cases needing reassignment</span><strong>{reassignmentCases.length}</strong></article>
      <Link className="govbtn-outline" href="/dashboard/reports">Open supervisor reports</Link>
    </div>

    {(overdueFilingCases.length > 0 || filingGaps.length > 0 || reassignmentCases.length > 0) && <section className="workbench-panel workload-alerts" aria-labelledby="workload-alerts-title">
      <div className="workbench-section-heading"><div><p className="eyebrow">Needs attention</p><h2 id="workload-alerts-title">Assignment and filing gaps</h2></div></div>
      {[...new Map([...overdueFilingCases, ...filingGaps, ...reassignmentCases].map((record) => [record.id, record])).values()].slice(0, 30).map((record) => {
        const reasons = [
          overdueFilingCases.includes(record) ? "Initial filing target overdue" : "",
          filingGaps.includes(record) ? record.filings.some((filing) => filing.isInitial && filing.status === "PENDING") ? "Initial filing awaiting portal approval" : "Portal approved, court filing date missing" : "",
          reassignmentCases.includes(record) ? "Assigned attorney is not on the active eligible roster" : "",
        ].filter(Boolean);
        return <p className="workload-alert-row" key={record.id}><strong><Link href={`/dashboard/cases/${record.id}`}>{record.caseNumber} · {record.title}</Link></strong><span>{reasons.join(" · ")}</span>{reassignmentCases.includes(record) && <Link href={`/dashboard/cases/${record.id}/handoff`}>Review handoff</Link>}</p>;
      })}
    </section>}

    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Review each recommendation before assigning</p><h2>Unassigned case queue</h2></div><Link href="/dashboard/cases?staff=all">Open case docket</Link></div>
      <form className="workload-filter"><div className="field"><label htmlFor="workload-q">Search</label><input id="workload-q" name="q" defaultValue={filters.q ?? ""} placeholder="Case number or party"/></div><div className="field"><label htmlFor="workload-stage">Case stage</label><select id="workload-stage" name="stage" defaultValue={stage}><option value="">All stages</option>{[...allowedStages].map((value) => <option key={value} value={value}>{value}</option>)}</select></div><button className="govbtn" type="submit">Filter</button></form>
      {qFilteredCases.length ? <div className="workload-case-list">{qFilteredCases.map((record) => {
        const recommendations = recommendCaseAssignees(record, assignmentContext);
        const proposed = recommendations[0];
        const deadline = getDeadlineSummary(record, now);
        return <article className="workload-case" key={record.id}>
          <div className="workload-case-info"><p className="eyebrow">{record.caseNumber} · {record.divisionGroup ?? "No group"}</p><h3><Link href={`/dashboard/cases/${record.id}`}>{record.title}</Link></h3><p>{record.type ?? "Case type not set"} · {record.stage ?? "Stage not set"} · opened {dateFormat.format(record.createdAt)}</p>
            {proposed && <div className="assignment-recommendation"><strong>Suggested: {proposed.displayName}</strong><span>{proposed.reason}</span></div>}
            {deadline.overdue > 0 && <span className="pill pill-red">{deadline.overdue} overdue deadline{deadline.overdue === 1 ? "" : "s"}</span>}
            {deadline.nextDate && <span className="note-inline">Next due date: {dateFormat.format(deadline.nextDate)}</span>}
          </div>
          <form action={assignFromWorkload} className="workload-assign"><input type="hidden" name="caseId" value={record.id}/><input type="hidden" name="expectedAssignedAttorneyId" value=""/><label htmlFor={`assignee-${record.id}`}>Assign attorney</label><select id={`assignee-${record.id}`} name="assigneeId" required defaultValue={proposed?.id ?? ""}><option value="" disabled>Select eligible attorney</option>{recommendations.map((attorney, index) => <option key={attorney.id} value={attorney.id}>{index === 0 ? "Recommended · " : ""}{attorney.displayName} · {attorney.activeCases} active · load {attorney.weightedLoad.toFixed(1)}</option>)}</select><button className="govbtn" type="submit" disabled={!recommendations.length}>Assign case</button></form>
        </article>;
      })}</div> : <div className="empty-state"><h2>No matching unassigned cases</h2><p>All visible open cases have an attorney, or the selected filters returned no results.</p></div>}
    </section>

    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Open non-archived cases</p><h2>Attorney caseload</h2></div><span className="pill pill-muted">Average {mean.toFixed(1)} active cases</span></div>
      <div className="workload-roster">{load.map((attorney) => {
        const owned = activeCases.filter((record) => record.assignedAttorneyId === attorney.id);
        const deadlineRows = owned.map((record) => ({ record, summary: getDeadlineSummary(record, now) }));
        const upcoming = deadlineRows.filter((row) => row.summary.nextDate).sort((a, b) => a.summary.nextDate!.getTime() - b.summary.nextDate!.getTime())[0];
        const overdueCases = deadlineRows.filter((row) => row.summary.overdue > 0).length;
        const filingGapsForAttorney = owned.filter((record) => record.filings.some((filing) => filing.isInitial && filing.status === "ACCEPTED") && !record.courtFiledAt).length;
        return <article className="workload-attorney-row" key={attorney.id}>
          <div className="workload-attorney-name"><strong>{attorney.displayName}</strong><span>{attorney.rank ?? "Attorney"}{attorney.divisionGroup ? ` · Group ${attorney.divisionGroup}` : ""}</span></div>
          <strong className="workload-count">{attorney.activeCases} active</strong>
          <span className={`workload-meter${attorney.activeCases <= mean ? " workload-lower" : ""}`} aria-label={`${attorney.activeCases} open cases`}><i style={{ width: `${Math.max(4, Math.min(100, attorney.activeCases * 8))}%` }}/></span>
          <span>{overdueCases} cases with overdue dates</span>
          <span>{filingGapsForAttorney} approved filing gaps</span>
          <span>{upcoming ? <>Next: {dateFormat.format(upcoming.summary.nextDate!)} · <Link href={`/dashboard/cases/${upcoming.record.id}`}>{upcoming.record.caseNumber}</Link></> : "No upcoming deadline recorded"}</span>
        </article>;
      })}</div>
      <p className="note-inline">The ranking cannot account for leave, conflicts, or work that has not been entered in the portal. Check those before confirming an assignment.</p>
    </section>

    {reassignmentCases.length > 0 && <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Attorney not on current eligible roster</p><h2>Cases needing reassignment</h2></div></div><ul className="workload-reassignment-list">{reassignmentCases.map((record) => <li key={record.id}><span><Link href={`/dashboard/cases/${record.id}/handoff`}>{record.caseNumber} · {record.title}</Link><small>Previously assigned to {record.assignedAttorney?.displayName ?? "an unavailable attorney"}</small></span><Link className="govbtn-outline" href={`/dashboard/cases/${record.id}/handoff`}>Open handoff</Link></li>)}</ul></section>}
  </div>;
}

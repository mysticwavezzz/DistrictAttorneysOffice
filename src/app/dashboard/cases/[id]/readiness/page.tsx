import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { canAccessCase, canEditCase, localUser } from "@/lib/case-access";
import { getProceduralDeadlines, isCourtDeadlineOverdue } from "@/lib/procedural-deadlines";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { addReadinessTask, updateCaseTask } from "../../workbench-actions";

export const metadata = staffPageMetadata("Court Readiness", "Review open preparation items before a hearing or trial.", "/dashboard/cases");
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" });

type Party = { name: string; role: string };

function parseParties(value: string): Party[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is Party => Boolean(item) && typeof item.name === "string" && typeof item.role === "string") : [];
  } catch { return []; }
}

export default async function CourtReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const now = new Date();
  const record = await prisma.case.findUnique({ where: { id }, include: {
    assignedAttorney: { select: { displayName: true } },
    filings: { select: { id: true, title: true, status: true, isInitial: true, createdAt: true, reviewedAt: true, supersedesId: true, revisions: { select: { id: true, status: true } } }, orderBy: { createdAt: "desc" } },
    events: { where: { kind: "COURT_HEARING", startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 5, select: { title: true, startsAt: true, sourceUrl: true } },
    evidence: { select: { id: true, title: true, sourceUrl: true, kind: true }, orderBy: { receivedAt: "desc" } },
    tasks: { where: { sourceReference: { startsWith: "readiness:" } }, orderBy: { createdAt: "desc" } },
  } });
  if (!record) notFound();
  if (!canAccessCase(session.user.tiers, user.id, record, user.division, user.divisionGroup)) redirect("/login?error=forbidden");
  const editable = canEditCase(session.user.tiers, user.division, record.division);
  const parties = parseParties(record.partyDetails);
  const witnesses = parties.filter((party) => party.role.toLocaleLowerCase() === "witness");
  const deadlines = getProceduralDeadlines(record);
  const overdueDeadlines = deadlines.filter((item) => isCourtDeadlineOverdue(item.dueDate, now));
  const pendingFilings = record.filings.filter((filing) => filing.status === "PENDING");
  const initialFiled = Boolean(record.courtFiledAt);
  const unresolvedReturned = record.filings.filter((filing) => filing.status === "REJECTED" && filing.revisions.length === 0 && !filing.supersedesId);
  const taskByKey = new Map<string, typeof record.tasks[number]>();
  for (const task of record.tasks) {
    if (task.sourceReference?.startsWith("readiness:") && !taskByKey.has(task.sourceReference.slice("readiness:".length))) taskByKey.set(task.sourceReference.slice("readiness:".length), task);
  }
  const motionFilings = record.filings.filter((filing) => /\bmotion\b/i.test(filing.title));
  const checks = [
    { label: "Attorney assigned", complete: Boolean(record.assignedAttorneyId), detail: record.assignedAttorney?.displayName ?? "No attorney assigned", href: `/dashboard/cases/${id}#edit-case` },
    { label: "Hearing date entered", complete: record.events.length > 0 || Boolean(record.pretrial && record.pretrial.getTime() >= now.getTime()), detail: record.events[0] ? `${record.events[0].title} · ${dateFormat.format(record.events[0].startsAt)}` : record.pretrial && record.pretrial.getTime() >= now.getTime() ? `Pretrial · ${dateFormat.format(record.pretrial)}` : "No future court hearing or pretrial date is recorded", href: `/dashboard/cases/${id}/workbench#timeline` },
    { label: "Judge assigned", complete: Boolean(record.assignedJudge?.trim()), detail: record.assignedJudge || "No judge recorded", href: `/dashboard/cases/${id}#edit-case` },
    { label: "Initial filing recorded with the court", complete: initialFiled, detail: record.courtFiledAt ? `Filed ${dateFormat.format(record.courtFiledAt)}` : "No actual court filing date recorded", href: `/dashboard/cases/${id}#court-filing` },
    { label: "No overdue entered deadlines", complete: overdueDeadlines.length === 0, detail: overdueDeadlines.length ? `${overdueDeadlines.length} overdue: ${overdueDeadlines.map((item) => item.label).join(", ")}` : "No entered procedural dates are overdue", href: `/dashboard/cases/${id}#deadlines` },
  ];
  const manualChecks = [
    { key: "witness-availability", label: "Witness availability and attendance", detail: witnesses.length ? `${witnesses.length} witness${witnesses.length === 1 ? "" : "es"} listed: ${witnesses.map((witness) => witness.name).join(", ")}` : "No witnesses are listed in the case record. Confirm whether any are needed.", complete: taskByKey.get("witness-availability")?.status === "DONE" },
    { key: "exhibits", label: "Exhibits reviewed and prepared", detail: record.evidence.length ? `${record.evidence.length} evidence record${record.evidence.length === 1 ? "" : "s"} linked` : "No evidence or exhibit records are linked yet.", complete: record.evidence.length > 0 && taskByKey.get("exhibits")?.status === "DONE" },
    { key: "filings", label: "Required filings and service checked", detail: `${pendingFilings.length} filing${pendingFilings.length === 1 ? "" : "s"} awaiting portal review · ${unresolvedReturned.length} returned without a replacement${initialFiled ? " · initial court filing recorded" : " · initial court filing date missing"}`, complete: initialFiled && pendingFilings.length === 0 && unresolvedReturned.length === 0 && taskByKey.get("filings")?.status === "DONE" },
    { key: "motions", label: "Motions and response dates reviewed", detail: motionFilings.length ? `${motionFilings.length} motion filing${motionFilings.length === 1 ? "" : "s"} on record${motionFilings.some((filing) => filing.status === "PENDING") ? " · at least one is awaiting review" : ""}` : "No filing titled as a motion is listed.", complete: !motionFilings.some((filing) => filing.status === "PENDING") && taskByKey.get("motions")?.status === "DONE" },
  ];
  const finishedChecks = checks.filter((check) => check.complete).length + manualChecks.filter((check) => check.complete).length;
  const totalChecks = checks.length + manualChecks.length;

  return <div className="case-readiness-page">
    <nav className="breadcrumb"><Link href="/dashboard/cases">Case docket</Link><span aria-hidden="true">/</span><Link href={`/dashboard/cases/${id}`}>{record.caseNumber}</Link><span aria-hidden="true">/</span><span>Court readiness</span></nav>
    <header className="case-workbench-banner"><div><p className="eyebrow">{record.caseNumber} · {record.division ?? "Unassigned division"}</p><h1>Court readiness</h1><p>{record.title}</p></div><div className="case-workbench-shortcuts"><Link className="govbtn-outline" href={`/dashboard/cases/${id}`}>Open case record</Link><Link className="govbtn" href={`/dashboard/cases/${id}/workbench`}>Open workbench</Link></div></header>
    <section className="readiness-summary"><strong>{finishedChecks} of {totalChecks} checks complete</strong><span>Use this as a preparation aid. It does not decide whether a case is ready for court.</span></section>
    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Based on the case record</p><h2>Case and calendar checks</h2></div></div><ul className="readiness-list">{checks.map((check) => <li key={check.label}><span className={`pill ${check.complete ? "pill-green" : "pill-gold"}`}>{check.complete ? "Recorded" : "Needs attention"}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div><Link href={check.href}>Review</Link></li>)}</ul></section>
    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Attorney confirmation</p><h2>Preparation checks</h2></div><Link href={`/dashboard/cases/${id}/workbench#tasks`}>Open case tasks</Link></div><p className="note-inline">Add a check to the case task list, then mark it complete after reviewing the underlying record.</p><ul className="readiness-list">{manualChecks.map((check) => {
      const task = taskByKey.get(check.key);
      const done = task?.status === "DONE";
      const dismissed = task?.status === "DISMISSED";
      return <li key={check.key}><span className={`pill ${check.complete ? "pill-green" : dismissed ? "pill-muted" : "pill-gold"}`}>{check.complete ? "Complete" : dismissed ? "Reopen check" : task ? "Needs work" : "Not checked"}</span><div><strong>{check.label}</strong><p>{check.detail}</p>{task && <small>{task.details}</small>}</div>{editable ? task && !done ? <form action={updateCaseTask}><input type="hidden" name="taskId" value={task.id}/><button className="govbtn-outline" name="status" value="DONE">Mark complete</button></form> : done ? <span className="note-inline">{check.complete ? "Completed" : "Review record"}</span> : <form action={addReadinessTask}><input type="hidden" name="caseId" value={id}/><input type="hidden" name="key" value={check.key}/><button className="govbtn-outline" type="submit">Add to tasks</button></form> : <span>{task?.status ?? "Not started"}</span>}</li>;
    })}</ul></section>
    {(pendingFilings.length > 0 || unresolvedReturned.length > 0 || motionFilings.some((filing) => filing.status === "PENDING")) && <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Filing status</p><h2>Items to review</h2></div><Link href={`/dashboard/cases/${id}#filings`}>Open filings</Link></div><ul>{pendingFilings.map((filing) => <li key={`pending-${filing.id}`}>{filing.title} · awaiting portal review</li>)}{unresolvedReturned.map((filing) => <li key={`returned-${filing.id}`}>{filing.title} · returned, no replacement filed</li>)}</ul></section>}
  </div>;
}

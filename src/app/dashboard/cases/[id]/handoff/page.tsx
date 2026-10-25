import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { canAccessCase, canAssignCase, localUser } from "@/lib/case-access";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";
import { getProceduralDeadlines, isCourtDeadlineOverdue } from "@/lib/procedural-deadlines";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { assignFromWorkload } from "../../workload-actions";

export const metadata = staffPageMetadata("Case Handoff", "Review case activity, deadlines, motions, evidence, and reassignment.", "/dashboard/cases");
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" });
const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

export default async function CaseHandoffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const record = await prisma.case.findUnique({ where: { id }, include: {
    assignedAttorney: { select: { displayName: true, divisionGroup: true } },
    createdBy: { select: { displayName: true } },
    comments: { orderBy: { createdAt: "desc" }, take: 1, include: { author: { select: { displayName: true } } } },
    filings: { select: { id: true, title: true, status: true, isInitial: true, createdAt: true, submittedAt: true, reviewedAt: true, filedAt: true, courtFilingUrl: true, pdfFileName: true, url: true }, orderBy: { createdAt: "desc" } },
    evidence: { select: { id: true, title: true, kind: true, sourceName: true, fileName: true, receivedAt: true, sourceUrl: true, sha256: true }, orderBy: { receivedAt: "desc" } },
    events: { where: { startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 10, select: { title: true, kind: true, startsAt: true, sourceUrl: true } },
    tasks: { where: { status: "OPEN" }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], take: 50, select: { id: true, title: true, dueAt: true, assignedToName: true, sourceReference: true } },
  } });
  if (!record) notFound();
  if (!canAccessCase(session.user.tiers, user.id, record, user.division, user.divisionGroup)) redirect("/login?error=forbidden");
  const canAssign = canAssignCase(session.user.tiers, user.division, record.division);
  const restrictToGroup = session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && record.division === "Criminal Division";
  const attorneys = canAssign ? await getDivisionCaseAssignees(record.division, { divisionGroup: restrictToGroup ? user.divisionGroup : record.divisionGroup, restrictToGroup }) : [];
  const proceduralDeadlines = getProceduralDeadlines(record);
  const now = new Date();
  const nextProceduralDeadline = proceduralDeadlines.find((deadline) => !isCourtDeadlineOverdue(deadline.dueDate, now));
  const nextEvent = record.events[0];
  const nextDate = [nextProceduralDeadline?.dueDate, nextEvent?.startsAt].filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const motions = record.filings.filter((filing) => /\bmotion\b/i.test(filing.title));

  return <div className="case-handoff-page">
    <nav className="breadcrumb"><Link href="/dashboard/cases">Case docket</Link><span aria-hidden="true">/</span><Link href={`/dashboard/cases/${id}`}>{record.caseNumber}</Link><span aria-hidden="true">/</span><span>Handoff</span></nav>
    <header className="case-workbench-banner"><div><p className="eyebrow">{record.caseNumber} · {record.division ?? "Unassigned division"}</p><h1>Case handoff</h1><p>{record.title}</p></div><div className="case-workbench-shortcuts"><Link className="govbtn-outline" href={`/dashboard/cases/${id}`}>Open case record</Link><Link className="govbtn" href={`/dashboard/cases/${id}/readiness`}>Court readiness</Link></div></header>
    <dl className="handoff-facts"><div><dt>Assigned attorney</dt><dd>{record.assignedAttorney?.displayName ?? "Unassigned"}</dd></div><div><dt>Submitting officer</dt><dd>{record.createdBy.displayName}</dd></div><div><dt>Stage</dt><dd>{record.stage ?? "Not set"}</dd></div><div><dt>Next date</dt><dd>{nextDate ? dateFormat.format(nextDate) : "None recorded"}</dd></div></dl>

    {canAssign && <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Transfer ownership</p><h2>Assign this case</h2></div></div><form action={assignFromWorkload} className="handoff-assignment-form"><input type="hidden" name="caseId" value={record.id}/><input type="hidden" name="expectedAssignedAttorneyId" value={record.assignedAttorneyId ?? ""}/><div className="field"><label htmlFor="handoff-assignee">New assigned attorney</label><select id="handoff-assignee" name="assigneeId" defaultValue={record.assignedAttorneyId ?? ""}><option value="">Unassigned</option>{record.assignedAttorneyId && !attorneys.some((attorney) => attorney.id === record.assignedAttorneyId) && <option value={record.assignedAttorneyId}>{record.assignedAttorney?.displayName ?? "Current attorney"} · no longer eligible</option>}{attorneys.map((attorney) => <option key={attorney.id} value={attorney.id}>{attorney.displayName}{attorney.divisionGroup ? ` · Group ${attorney.divisionGroup}` : ""}</option>)}</select></div><button className="govbtn" type="submit">Save assignment</button></form></section>}

    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Most recent case entry</p><h2>Last action</h2></div><Link href={`/dashboard/cases/${id}#activity`}>View full history</Link></div>{record.comments[0] ? <article className="handoff-last-action"><strong>{record.comments[0].isSystem ? "System history" : record.comments[0].author?.displayName ?? "Unknown"}</strong><time dateTime={record.comments[0].createdAt.toISOString()}>{dateTimeFormat.format(record.comments[0].createdAt)}</time><p>{record.comments[0].body}</p></article> : <p className="note-inline">No case activity has been recorded.</p>}</section>

    <div className="handoff-columns"><section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Deadlines and settings</p><h2>Next deadlines</h2></div><Link href={`/dashboard/cases/${id}#deadlines`}>Manage dates</Link></div>{proceduralDeadlines.length ? <ul className="handoff-list">{proceduralDeadlines.map((deadline) => <li key={deadline.key}><strong className={isCourtDeadlineOverdue(deadline.dueDate, now) ? "deadline-overdue" : undefined}>{deadline.label}</strong><span>{dateFormat.format(deadline.dueDate)}{isCourtDeadlineOverdue(deadline.dueDate, now) ? " · overdue" : ""}</span><small>{deadline.authority}</small></li>)}</ul> : <p className="note-inline">No procedural deadlines are entered.</p>}{record.events.length > 0 && <><h3>Upcoming case dates</h3><ul className="handoff-list">{record.events.map((event, index) => <li key={`${event.title}-${index}`}><strong>{event.title}</strong><span>{dateTimeFormat.format(event.startsAt)}</span><small>{event.kind.replaceAll("_", " ")}{event.sourceUrl ? <> · <a href={event.sourceUrl} target="_blank" rel="noreferrer noopener">Source ↗</a></> : ""}</small></li>)}</ul></>}</section>

      <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Pending and filed motions</p><h2>Motions and other filings</h2></div><Link href={`/dashboard/cases/${id}#filings`}>Open filings</Link></div>{motions.length ? <ul className="handoff-list">{motions.map((filing) => <li key={filing.id}><strong>{filing.title}</strong><span className={`pill ${filing.status === "PENDING" ? "pill-gold" : filing.status === "ACCEPTED" ? "pill-green" : filing.status === "REJECTED" ? "pill-red" : "pill-muted"}`}>{filing.status}</span><small>Submitted {filing.submittedAt ? dateFormat.format(filing.submittedAt) : "date unavailable"}{filing.reviewedAt ? ` · reviewed ${dateFormat.format(filing.reviewedAt)}` : ""}{filing.filedAt ? ` · court filed ${dateFormat.format(filing.filedAt)}` : ""}</small>{filing.pdfFileName && <a href={`/api/cases/filings/${filing.id}/pdf`} target="_blank" rel="noreferrer noopener">Open PDF ↗</a>}{filing.url && <a href={filing.url} target="_blank" rel="noreferrer noopener">Open filing ↗</a>}</li>)}</ul> : <p className="note-inline">No filing titled as a motion is listed.</p>}<h3>Open case tasks</h3>{record.tasks.length ? <ul className="handoff-list">{record.tasks.map((task) => <li key={task.id}><strong>{task.title}</strong><span>{task.assignedToName ?? "Unassigned"}</span><small>{task.dueAt ? `Due ${dateFormat.format(task.dueAt)}` : "No due date"}{task.sourceReference ? ` · ${task.sourceReference}` : ""}</small></li>)}</ul> : <p className="note-inline">No open case tasks.</p>}</section></div>

    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Case source links</p><h2>Evidence and supporting records</h2></div><Link href={`/dashboard/cases/${id}/workbench#evidence`}>Manage evidence</Link></div>{record.evidence.length ? <div className="handoff-evidence-list">{record.evidence.map((item) => <article key={item.id}><span className="pill pill-muted">{item.kind.replaceAll("_", " ")}</span><strong>{item.title}</strong><span>{item.sourceName || "Source not recorded"}{item.fileName ? ` · ${item.fileName}` : ""} · received {dateFormat.format(item.receivedAt)}</span>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">Open source ↗</a>}{item.sha256 && <code>SHA-256 {item.sha256}</code>}</article>)}</div> : <p className="note-inline">No evidence source links are recorded.</p>}</section>
  </div>;
}

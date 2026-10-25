import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { canAccessCase, canEditCase, localUser } from "@/lib/case-access";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { RefreshWhilePending } from "@/components/refresh-while-pending";
import { CASE_AI_ACTIONS, type CaseAiAction } from "@/lib/case-ai-workbench";
import { DOCUMENT_TEMPLATES } from "@/config/document-templates";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";
import { addAcceptedCaseTask, addCaseEvent, addCaseEvidence, recordCaseAiFeedback, requestCaseAiRun, updateCaseTask } from "../../workbench-actions";

export const metadata = staffPageMetadata("Case Workbench", "Text-only research and case coordination workspace.", "/dashboard/cases");

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" });
const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });
const actions: Array<{ id: CaseAiAction; title: string; description: string }> = [
  { id: "SUMMARY", title: "Summarize the record", description: "Separate sourced facts, allegations, and open questions." },
  { id: "COMPARE", title: "Compare documents", description: "Find mismatches and quote the source language." },
  { id: "TIMELINE", title: "Build a timeline", description: "List dated events with source references." },
  { id: "CITATION_CHECK", title: "Check citations", description: "Compare text citations with the connected rule excerpts." },
  { id: "HEARING_PREP", title: "Prepare a hearing checklist", description: "Collect points and questions for attorney review." },
  { id: "DISCLOSURE_CHECK", title: "Prepare a disclosure checklist", description: "Surface records and questions staff should verify." },
  { id: "DRAFT_DOCUMENT", title: "Prepare a first draft", description: "Use an office template outline, source-linked facts, and clear placeholders for missing information." },
];

type SavedResult = {
  demo?: boolean;
  summary?: string;
  draftText?: string;
  verifiedFindings?: Array<{ kind: string; text: string; sourceId: string; quote: string; sourceVerified: boolean; relatedSourceId?: string; relatedQuote?: string; relatedSourceVerified: boolean }>;
  verifiedTasks?: Array<{ title: string; sourceId: string; quote: string; sourceVerified: boolean }>;
  sources?: Array<{ id: string; title: string; citation?: string; version?: string; sourceUrl?: string }>;
};

function sourceReference(result: SavedResult, sourceId: string) {
  const source = result.sources?.find((item) => item.id === sourceId);
  if (!source) return <small>No source linked</small>;
  return <small>Source: {source.sourceUrl ? <a href={source.sourceUrl} target={source.sourceUrl.startsWith("/") ? undefined : "_blank"} rel="noreferrer noopener">{source.title} ↗</a> : source.title}{source.citation ? ` · ${source.citation}` : ""}{source.version ? ` · ${source.version}` : ""}</small>;
}

function readResult(value: string | null): SavedResult | null {
  if (!value) return null;
  try { return JSON.parse(value) as SavedResult; } catch { return null; }
}

export default async function CaseWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const record = await prisma.case.findUnique({
    where: { id },
    include: {
      assignedAttorney: { select: { displayName: true } },
      events: { orderBy: { startsAt: "asc" } },
      evidence: { orderBy: { receivedAt: "desc" } },
      tasks: { orderBy: [{ status: "asc" }, { createdAt: "desc" }] },
      aiRuns: { orderBy: { createdAt: "desc" }, take: 12 },
      filings: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, pdfFileName: true, status: true, createdAt: true } },
      aopcs: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, reportId: true, status: true, createdAt: true, pdfFileName: true, documentUrl: true } },
    },
  });
  if (!record) notFound();
  if (!canAccessCase(session.user.tiers, user.id, record, user.division, user.divisionGroup)) redirect("/login?error=forbidden");
  const editable = canEditCase(session.user.tiers, user.division, record.division);
  const attorneys = editable ? await getDivisionCaseAssignees(record.division, { divisionGroup: user.divisionGroup, restrictToGroup: session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && record.division === "Criminal Division" }) : [];

  return <div className="case-workbench-page">
    <RefreshWhilePending active={record.aiRuns.some((run) => run.status === "QUEUED" || run.status === "RUNNING")} />
    <nav className="breadcrumb"><Link href="/dashboard/cases">Case docket</Link><span aria-hidden="true">/</span><Link href={`/dashboard/cases/${id}`}>{record.caseNumber}</Link><span aria-hidden="true">/</span><span>Workbench</span></nav>
    <header className="case-workbench-banner">
      <div><p className="eyebrow">{record.caseNumber} · {record.division ?? "Unassigned division"}</p><h1>{record.title}</h1><p>{record.assignedAttorney?.displayName ? `Assigned to ${record.assignedAttorney.displayName}` : "No attorney assigned"} · {record.stage ?? "Stage not set"}</p></div>
      <div className="case-workbench-shortcuts"><Link className="govbtn-outline" href={`/dashboard/cases/${id}`}>Open case record</Link><a className="govbtn" href={`/api/dashboard/cases/${id}/packet`}>Download case packet</a></div>
    </header>

    <section className="workbench-callout" aria-label="AI limits"><strong>Text-only AI assistance.</strong> Only case text and selectable PDF text are sent to the model. Results are source-checked where possible and remain advisory. Staff make every legal and filing decision.</section>

    <section className="workbench-panel" id="ai-workbench">
      <div className="workbench-section-heading"><div><p className="eyebrow">Text-only · advisory</p><h2>AI workbench</h2></div><span className="pill pill-muted">{record.aiRuns.length} recent run{record.aiRuns.length === 1 ? "" : "s"}</span></div>
      {editable ? <>
        <div className="workbench-actions-grid">{actions.map((action) => <form key={action.id} action={requestCaseAiRun} className="workbench-action-card"><input type="hidden" name="caseId" value={id}/><input type="hidden" name="action" value={action.id}/><h3>{action.title}</h3><p>{action.description}</p>{action.id === "DRAFT_DOCUMENT" && <div className="field"><label htmlFor="draft-template-id">Office template</label><select id="draft-template-id" name="templateId" required defaultValue=""><option value="" disabled>Choose a template</option>{DOCUMENT_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select><small>The result stays in this case workspace. It does not create or file a document.</small></div>}<button className="govbtn-outline" type="submit">{action.id === "DRAFT_DOCUMENT" ? "Prepare unfiled draft" : "Run on current case text"}</button></form>)}</div>
        {!process.env.GROQ_API_KEY && process.env.LOCAL_AI_DEMO_MODE !== "true" && <p className="note-inline">No Groq key is configured in this local environment. Results will fail closed; no paid fallback is used.</p>}
      </> : <p className="note-inline">Case edit access is required to submit case text for AI processing.</p>}
      {record.aiRuns.length ? <div className="workbench-runs">{record.aiRuns.map((run) => {
        const result = run.status === "COMPLETED" ? readResult(run.resultJson) : null;
        const label = actions.find((item) => item.id === run.action)?.title ?? run.action;
        return <article className="workbench-run" key={run.id}>
          <header><div><h3>{label}</h3><span className={`pill ${run.status === "COMPLETED" ? "pill-green" : run.status === "FAILED" ? "pill-red" : "pill-gold"}`}>{run.status.toLowerCase()}{run.cacheHit ? " · cached" : ""}{result?.demo ? " · local demo" : ""}</span></div><time dateTime={run.createdAt.toISOString()}>{dateTimeFormat.format(run.createdAt)}</time></header>
          <p className="workbench-run-meta">Model {run.modelId} · {run.latencyMs === null ? "latency pending" : `${run.latencyMs} ms`} · {run.inputTokens ?? "—"} input / {run.outputTokens ?? "—"} output tokens</p>
          {run.status === "QUEUED" || run.status === "RUNNING" ? <p role="status">Working from the current text bundle. Refresh shortly for the result.</p> : run.status === "FAILED" ? <p role="alert">No result was produced ({run.failureCode ?? "unknown failure"}). Review the case sources manually.</p> : result ? <>
            {result.demo && <p className="message">Local demo output only. This is a UI fixture, not a model response.</p>}
            <p className="workbench-summary">{result.summary}</p>
            {result.draftText && <section className="workbench-draft" aria-label="Unfiled working draft"><div className="workbench-section-heading"><h4>Working draft · attorney review required</h4><span className="pill pill-gold">Not filed</span></div><pre>{result.draftText}</pre><p className="note-inline">Check every source and placeholder in the official template before using this text. Nothing has been filed or sent.</p></section>}
            {result.verifiedFindings?.length ? <ul className="workbench-findings">{result.verifiedFindings.map((finding, index) => <li key={`${run.id}-${index}`}><div><span className="pill pill-muted">{finding.kind.replaceAll("_", " ")}</span> <span className={finding.sourceVerified ? "pill pill-green" : "pill pill-gold"}>{finding.sourceVerified ? "Source quote matched" : "Verify source"}</span></div><p>{finding.text}</p>{finding.quote && <><blockquote>{finding.quote}</blockquote>{sourceReference(result, finding.sourceId)}</>}{finding.relatedQuote && <div className="workbench-related-quote"><span className={finding.relatedSourceVerified ? "pill pill-green" : "pill pill-gold"}>{finding.relatedSourceVerified ? "Second quote matched" : "Verify second source"}</span><blockquote>{finding.relatedQuote}</blockquote>{sourceReference(result, finding.relatedSourceId ?? "")}</div>}{editable && ["DISCREPANCY", "QUESTION"].includes(finding.kind) && <form action={addAcceptedCaseTask} className="workbench-followup-form"><input type="hidden" name="caseId" value={id}/><input type="hidden" name="title" value={`Verify: ${finding.text}`}/><input type="hidden" name="details" value={[finding.quote, finding.relatedQuote].filter(Boolean).join(" / ")}/><input type="hidden" name="sourceReference" value={[finding.sourceId, finding.relatedSourceId].filter(Boolean).join(", ")}/><label className="sr-only" htmlFor={`${run.id}-issue-owner-${index}`}>Assign issue follow-up to attorney</label><select id={`${run.id}-issue-owner-${index}`} name="assigneeId" defaultValue={user.id}>{attorneys.map((attorney) => <option key={attorney.id} value={attorney.id}>{attorney.displayName}</option>)}</select><button type="submit" className="govbtn-outline">Track issue and assign</button></form>}</li>)}</ul> : <p className="note-inline">No findings were returned.</p>}
            {result.verifiedTasks?.length ? <div><h4>Suggested tasks · accept and assign individually</h4><ul className="workbench-task-proposals">{result.verifiedTasks.map((task, index) => <li key={`${run.id}-task-${index}`}><div><strong>{task.title}</strong><p>{task.quote || "No direct source quote. Verify the task before accepting."}</p>{sourceReference(result, task.sourceId)} <span>{task.sourceVerified ? "Quote matched" : "Verify source"}</span></div>{editable && <form action={addAcceptedCaseTask}><input type="hidden" name="caseId" value={id}/><input type="hidden" name="title" value={task.title}/><input type="hidden" name="details" value={task.quote}/><input type="hidden" name="sourceReference" value={task.sourceId}/><label className="sr-only" htmlFor={`${run.id}-owner-${index}`}>Assign task to attorney</label><select id={`${run.id}-owner-${index}`} name="assigneeId" defaultValue={user.id}>{attorneys.map((attorney) => <option key={attorney.id} value={attorney.id}>{attorney.displayName}</option>)}</select><button className="govbtn-outline" type="submit">Accept and assign</button></form>}</li>)}</ul></div> : null}
            {editable && <form action={recordCaseAiFeedback} className="workbench-feedback"><input type="hidden" name="runId" value={run.id}/><label htmlFor={`${run.id}-feedback-note`}>Correction note <span className="hint">Optional</span></label><input id={`${run.id}-feedback-note`} name="note" maxLength={1500} defaultValue={run.reviewerNote ?? ""} placeholder="What should the result have handled differently?"/><button className="govbtn-outline" name="feedback" value="HELPFUL" type="submit">Useful</button><button className="govbtn-outline" name="feedback" value="NEEDS_CORRECTION" type="submit">Needs correction</button></form>}
          </> : <p className="note-inline">Saved output could not be read. Check the source documents directly.</p>}
        </article>;
      })}</div> : <div className="empty-state"><h3>No workbench runs yet</h3><p>Choose a text task above. Source material and model version will be recorded with the result.</p></div>}
    </section>

    <div className="workbench-columns">
      <section className="workbench-panel" id="timeline"><div className="workbench-section-heading"><div><p className="eyebrow">Court events and office targets</p><h2>Case calendar</h2></div><Link href="/dashboard/cases/calendar">Open calendar</Link></div>
        {record.events.length ? <ol className="workbench-event-list">{record.events.map((event) => <li key={event.id}><span className={`pill ${event.isCourtOrdered ? "pill-navy" : "pill-gold"}`}>{event.isCourtOrdered ? "Court ordered" : "Office target"}</span><time dateTime={event.startsAt.toISOString()}>{dateTimeFormat.format(event.startsAt)}</time><strong>{event.title}</strong><p>{event.details || event.kind.replaceAll("_", " ")}</p>{event.sourceUrl && <a href={event.sourceUrl} target="_blank" rel="noreferrer noopener">Open source ↗</a>}</li>)}</ol> : <p className="note-inline">No case-specific events have been added.</p>}
        {editable && <details className="workbench-form-fold"><summary>Add a hearing, order, or office target</summary><form action={addCaseEvent} className="workbench-form"><input type="hidden" name="caseId" value={id}/><div className="field"><label htmlFor="event-title">Event title</label><input id="event-title" name="title" maxLength={180} required/></div><div className="field"><label htmlFor="event-kind">Event type</label><select name="kind" id="event-kind"><option value="COURT_HEARING">Court hearing</option><option value="COURT_DEADLINE">Court deadline</option><option value="OFFICE_TARGET">Office target</option><option value="OTHER">Other</option></select></div><div className="field"><label htmlFor="event-date">Date and time</label><input id="event-date" name="startsAt" type="datetime-local" required/></div><div className="field"><label htmlFor="event-url">Order / calendar source link</label><input id="event-url" name="sourceUrl" type="url" maxLength={2000}/></div><div className="field field-wide"><label htmlFor="event-details">Details</label><textarea id="event-details" name="details" rows={2} maxLength={4000}/></div><label className="checkbox-row"><input type="checkbox" name="isCourtOrdered"/> Court-ordered date</label><button className="govbtn" type="submit">Add event</button></form></details>}
      </section>

      <section className="workbench-panel" id="tasks"><div className="workbench-section-heading"><div><p className="eyebrow">Human-approved follow-up</p><h2>Case tasks</h2></div><span className="pill pill-muted">{record.tasks.filter((task) => task.status === "OPEN").length} open</span></div>
        {record.tasks.length ? <ul className="workbench-existing-tasks">{record.tasks.map((task) => <li key={task.id}><div><strong>{task.title}</strong><p>{task.details || "No further details."}</p><small>{task.status.replaceAll("_", " ")} · {task.assignedToName ?? "Unassigned"}{task.sourceReference ? ` · Source ${task.sourceReference}` : ""}</small></div>{editable && task.status === "OPEN" && <div className="workbench-task-actions"><form action={updateCaseTask}><input type="hidden" name="taskId" value={task.id}/><button className="linklike" name="status" value="DONE">Mark done</button></form><form action={updateCaseTask}><input type="hidden" name="taskId" value={task.id}/><button className="linklike" name="status" value="DISMISSED">Dismiss</button></form></div>}</li>)}</ul> : <p className="note-inline">No accepted tasks.</p>}
      </section>
    </div>

    <section className="workbench-panel" id="evidence"><div className="workbench-section-heading"><div><p className="eyebrow">Source register</p><h2>Evidence and transcript index</h2></div><span className="pill pill-muted">{record.evidence.length + record.filings.length + record.aopcs.length} linked records</span></div>
      <p className="note-inline">This index stores source, receipt date, filename, hash, and staff notes. The workbench uses only text records and selectable PDF text.</p>
      <div className="evidence-register">{record.filings.map((filing) => <article key={`filing-${filing.id}`}><span className="pill pill-navy">Filing</span><strong>{filing.title}</strong><span>{filing.pdfFileName ?? "No file name"} · {filing.status} · {dateFormat.format(filing.createdAt)}</span><a href={`/api/cases/filings/${filing.id}/pdf`} target="_blank" rel="noreferrer noopener">Open PDF ↗</a></article>)}{record.aopcs.map((aopc) => <article key={`aopc-${aopc.id}`}><span className="pill pill-navy">AOPC / report</span><strong>{aopc.reportId ?? aopc.title}</strong><span>{aopc.status} · {dateFormat.format(aopc.createdAt)}</span>{aopc.pdfFileName ? <a href={`/api/aopcs/${aopc.id}/pdf`} target="_blank" rel="noreferrer noopener">Open PDF ↗</a> : aopc.documentUrl ? <a href={aopc.documentUrl} target="_blank" rel="noreferrer noopener">Open source ↗</a> : null}</article>)}{record.evidence.map((item) => <article key={item.id}><span className={`pill ${item.kind === "VIDEO" || item.kind === "PHOTOGRAPH" ? "pill-gold" : "pill-muted"}`}>{item.kind.replaceAll("_", " ")}</span><strong>{item.title}</strong><span>{item.sourceName || "Source not recorded"} · Received {dateFormat.format(item.receivedAt)}</span>{item.fileName && <span>File: {item.fileName}</span>}{item.sha256 && <code>SHA-256 {item.sha256}</code>}{item.notes && <p>{item.notes}</p>}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">Open source ↗</a>}</article>)}{record.evidence.length + record.filings.length + record.aopcs.length === 0 && <p className="note-inline">No evidence or filing sources are linked yet.</p>}</div>
      {editable && <details className="workbench-form-fold"><summary>Add source or transcript reference</summary><form action={addCaseEvidence} className="workbench-form" encType="multipart/form-data"><input type="hidden" name="caseId" value={id}/><div className="field"><label htmlFor="evidence-title">Record title</label><input id="evidence-title" name="title" maxLength={180} required/></div><div className="field"><label htmlFor="evidence-kind">Record type</label><select id="evidence-kind" name="kind"><option value="DOCUMENT">Document</option><option value="TEXT_RECORD">Written evidence notes</option><option value="COURT_TRANSCRIPT">Court transcript</option><option value="PHOTOGRAPH">Photograph</option><option value="VIDEO">Video</option><option value="OTHER">Other</option></select></div><div className="field"><label htmlFor="evidence-source">Source / author</label><input id="evidence-source" name="sourceName" maxLength={180}/></div><div className="field"><label htmlFor="evidence-file">Original filename</label><input id="evidence-file" name="fileName" maxLength={180}/></div><div className="field"><label htmlFor="evidence-date">Received date</label><input id="evidence-date" name="receivedAt" type="date"/></div><div className="field"><label htmlFor="evidence-sha">SHA-256 hash <span className="hint">Optional</span></label><input id="evidence-sha" name="sha256" pattern="[A-Fa-f0-9]{64}" maxLength={64}/></div><div className="field field-wide"><label htmlFor="evidence-url">Source or Discord message link</label><input id="evidence-url" name="sourceUrl" type="url" maxLength={2000} placeholder="https://discord.com/channels/..."/></div><div className="field field-wide"><label htmlFor="evidence-notes">Staff notes or transcript text</label><textarea id="evidence-notes" name="notes" rows={4} maxLength={20000}/></div><div className="field field-wide"><label htmlFor="transcript-file">Import exported transcript (.txt) <span className="hint">Text only - 2 MB max</span></label><input id="transcript-file" name="transcriptFile" type="file" accept=".txt,text/plain"/></div><label className="checkbox-row"><input type="checkbox" name="confirmCaseAssociation" required/> I reviewed the source and confirm it belongs on this case.</label><button className="govbtn" type="submit">Add to evidence index</button></form></details>}
    </section>

    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Connected reference library</p><h2>Source record for research</h2></div><Link href="/98981/sources">Manage sources ↗</Link></div><p>Research actions retrieve only active text sources. Each result records the source title, citation, version, and official link when provided. If a relevant rule or statute is not connected, add the current text before relying on a research result.</p><details className="workbench-source-list"><summary>Sources sent to AI for the latest run (text only)</summary><ul>{record.aiRuns.slice(0, 1).flatMap((run) => { const result = readResult(run.resultJson); return result?.sources ?? []; }).map((source) => <li key={source.id}><strong>{source.title}</strong> <code>{source.id}</code>{source.citation && <span> · {source.citation}</span>}{source.version && <span> · {source.version}</span>}{source.sourceUrl && <> · <a href={source.sourceUrl} target="_blank" rel="noreferrer noopener">Open source ↗</a></>}</li>)}</ul><p className="note-inline">The system records prompt and source versions with each run. Unverified quotes are marked and must be checked manually.</p></details></section>
  </div>;
}

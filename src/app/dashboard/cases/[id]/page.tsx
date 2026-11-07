import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser, canAccessCase, canViewCases, canEditCase, canAssignCase, canReviewDivision } from "@/lib/case-access";
import { CASE_STATUSES, caseStatusColor, hasReachedChargesFiledStatus } from "@/config/case-statuses";
import { updateCase, deleteCase, deleteFiling, addComment, fileCase, recordCourtFiling, recordAdditionalCourtFiling } from "../actions";
import { addCaseEvent, addCaseEvidence, addCaseTask, updateCaseTask } from "../workbench-actions";
import { submitCaseRequest } from "../requests/actions";
import { getSiteConfiguration } from "@/lib/site-settings";
import { RemoveButton } from "@/components/remove-button";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { shareMetadata } from "@/lib/share-metadata";
import { CaseFoldPersistence } from "@/components/case-fold-persistence";
import { CaseSectionLink } from "@/components/case-section-link";
import { shouldRequireFilingApproval } from "@/lib/filing-approval";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const record = await prisma.case.findUnique({ where: { id }, select: { caseNumber: true, title: true, type: true, stage: true } });
    if (record) {
      const description = [record.type, record.stage ? `Status: ${record.stage}` : "Case record"].filter(Boolean).join(" · ");
      return { ...shareMetadata(`${record.caseNumber} · ${record.title}`, description, `/dashboard/cases/${id}`), robots: { index: false, follow: false } };
    }
  } catch {
    // Keep a safe generic preview if the database is temporarily unavailable.
  }
  return { ...staffPageMetadata("Case Record", "Private staff case record.", "/dashboard/cases"), robots: { index: false, follow: false } };
}

type CaseWithRelations = Prisma.CaseGetPayload<{
  include: {
    assignedAttorney: true;
    createdBy: true;
    filings: { select: { id: true; title: true; url: true; pdfFileName: true; status: true; documentType: true; isInitial: true; reviewedAt: true; submittedAt: true; filedAt: true; courtFilingUrl: true; reviewNote: true; revisionNote: true; supersedesId: true; addedById: true; createdAt: true; addedBy: { select: { displayName: true } }; supersedes: { select: { id: true; title: true } }; revisions: { select: { id: true; title: true; status: true } } } };
    comments: { include: { author: true } };
    relatedTo: true;
    relatedFrom: true;
    events: true;
    evidence: true;
    tasks: true;
    aopcs: true;
  };
}>;

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });
const courtDateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" });

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !canViewCases(session.user.tiers)) {
    redirect("/login?error=forbidden");
  }
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");

  let caseRecord: CaseWithRelations | null = null;
  let attorneys: { id: string; displayName: string }[] = [];
  try {
    caseRecord = await prisma.case.findUnique({
      where: { id },
      include: {
        assignedAttorney: true,
        createdBy: true,
        filings: { select: { id: true, title: true, url: true, pdfFileName: true, status: true, documentType: true, isInitial: true, reviewedAt: true, submittedAt: true, filedAt: true, courtFilingUrl: true, reviewNote: true, revisionNote: true, supersedesId: true, addedById: true, createdAt: true, addedBy: { select: { displayName: true } }, supersedes: { select: { id: true, title: true } }, revisions: { select: { id: true, title: true, status: true } } }, orderBy: { createdAt: "desc" } },
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
        relatedTo: true,
        relatedFrom: true,
        events: { orderBy: { startsAt: "asc" } },
        evidence: { orderBy: { receivedAt: "desc" } },
        tasks: { orderBy: [{ status: "asc" }, { createdAt: "desc" }] },
        aopcs: { orderBy: { createdAt: "desc" } },
      },
    });
  } catch (error) {
    console.error("Failed to load case", error);
    throw error;
  }

  if (!caseRecord) notFound();
  const caseStatuses = await getSiteConfiguration("caseStatuses", CASE_STATUSES);
  if (!canAccessCase(session.user.tiers, user.id, caseRecord, user.division, user.divisionGroup)) {
    redirect("/login?error=forbidden");
  }

  const canEdit = canEditCase(session.user.tiers, user.division, caseRecord.division);
  const canFileDocument = canEdit;
  const canFileCourt = canEdit || (hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) && caseRecord.createdById === user.id);
  const canDelete = hasCapability(session.user.tiers, CAPABILITIES.CASES_DELETE);
  const canAssign = canAssignCase(session.user.tiers, user.division, caseRecord.division);
  const canPropose = !canEdit && hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT);
  const canReviewThisDivision = canReviewDivision(session.user.tiers, user.division, caseRecord.division, user.divisionGroup, caseRecord.divisionGroup ?? caseRecord.assignedAttorney?.divisionGroup ?? caseRecord.createdBy.divisionGroup);
  const visibleFilings = caseRecord.filings.filter((filing) => filing.status === "ACCEPTED" || filing.addedById === user.id || canReviewThisDivision || (filing.documentType === "AOPC" && canAccessCase(session.user.tiers, user.id, caseRecord, user.division, user.divisionGroup)));
  const aopcFilings = visibleFilings.filter((filing) => filing.documentType === "AOPC");
  const reusableCourtFilings = canFileCourt ? await prisma.caseFiling.findMany({
    where: { caseId: id, status: "ACCEPTED", pdfData: { not: null } },
    select: { id: true, title: true, pdfFileName: true },
    orderBy: { createdAt: "desc" },
  }) : [];

  if (canEdit) {
    try {
      attorneys = await getDivisionCaseAssignees(
        hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) ? null : caseRecord.division,
        { divisionGroup: user.divisionGroup, restrictToGroup: session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL) },
      );
    } catch (error) {
      console.error("Failed to load attorneys", error);
    }
    const paraRoster = await prisma.rosterEntry.findMany({ where: { unit: caseRecord.division, isActive: true, rank: { in: ["Secretary", "Secretary Supervisor"] }, robloxUserId: { not: null } }, select: { robloxUserId: true, name: true } });
    const paraUsers = paraRoster.length ? await prisma.user.findMany({ where: { robloxUserId: { in: paraRoster.map((entry) => entry.robloxUserId!).filter(Boolean) } }, select: { id: true, displayName: true } }) : [];
    const assignedIds = new Set(attorneys.map((entry) => entry.id));
    attorneys = [...attorneys, ...paraUsers.filter((entry) => !assignedIds.has(entry.id))];
  }

  const statusColor = caseStatusColor(caseRecord.stage);
  const relatedCasesMap = new Map<string, { id: string; caseNumber: string; title: string }>();
  for (const c of [...caseRecord.relatedTo, ...caseRecord.relatedFrom]) {
    relatedCasesMap.set(c.id, c);
  }
  const relatedCases = Array.from(relatedCasesMap.values());
  const relatedCaseNumbersDefault = caseRecord.relatedTo.map((c) => c.caseNumber).join(", ");
  const legacyInitialFiling = !caseRecord.filings.some((filing) => filing.isInitial)
    ? [...caseRecord.filings].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).find((filing) => filing.status === "ACCEPTED" && Math.abs(filing.createdAt.getTime() - caseRecord.createdAt.getTime()) <= 120_000)
    : undefined;
  const initialFilings = caseRecord.filings.filter((filing) => filing.isInitial);
  if (initialFilings.length === 0 && legacyInitialFiling) initialFilings.push(legacyInitialFiling);
  const initialFilingIds = new Set(initialFilings.map((filing) => filing.id));
  const visibleOtherFilings = visibleFilings.filter((filing) => !initialFilingIds.has(filing.id) && filing.documentType !== "AOPC");
  const pendingInitial = initialFilings.some((filing) => filing.status === "PENDING");
  const acceptedInitialFiling = initialFilings.find((filing) => filing.status === "ACCEPTED");
  const acceptedInitial = Boolean(acceptedInitialFiling);
  const draftInitial = initialFilings.find((filing) => filing.status === "DRAFT");
  const returnedInitial = initialFilings.find((filing) => filing.status === "REJECTED");
  const effectiveCourtFiledAt = caseRecord.courtFiledAt ?? acceptedInitialFiling?.filedAt ?? null;
  const isCourtFiled = Boolean(effectiveCourtFiledAt);
  const chargesFiledByStatus = hasReachedChargesFiledStatus(caseRecord.stage, caseStatuses);
  const courtFilingLabel = effectiveCourtFiledAt ? "Filed with court" : acceptedInitial ? "Approved · ready to file" : pendingInitial ? "Awaiting review" : returnedInitial ? "Returned for correction" : chargesFiledByStatus ? "Complaint filing not recorded" : "Unfiled in court";
  const courtFilingColor = effectiveCourtFiledAt ? "green" : acceptedInitial || pendingInitial ? "gold" : returnedInitial ? "red" : "muted";
  const openTasks = caseRecord.tasks.filter((task) => task.status === "OPEN");
  let parties: { name: string; role: string }[] = [];
  try {
    const parsedParties = JSON.parse(caseRecord.partyDetails) as unknown;
    if (Array.isArray(parsedParties)) parties = parsedParties.filter((item): item is { name: string; role: string } => Boolean(item) && typeof item.name === "string" && typeof item.role === "string");
  } catch {
    parties = [];
  }

  const otherFilingsSection = (
    <section className="case-subsection" aria-labelledby="other-filings-title">
      <div className="case-subsection-heading"><div><p className="eyebrow">Portal documents</p><h3 id="other-filings-title">Other filings</h3></div><span>{visibleOtherFilings.length}</span></div>
      {canFileDocument && <Link href={`/dashboard/filings/new?caseId=${caseRecord.id}`} className="govbtn-outline">File a document</Link>}
      {visibleOtherFilings.length === 0 ? <p className="note-inline">No other filings attached.</p> : <ul className="case-filings-list">
        {visibleOtherFilings.map((f) => (
          <li className="case-filing-row" key={f.id}>
            <div className="case-filing-info" id={`filing-${f.id}`}>
              <strong>{f.title} <span className={`pill ${f.status === "ACCEPTED" ? "pill-green" : f.status === "PENDING" ? "pill-gold" : f.status === "DRAFT" ? "pill-muted" : "pill-red"}`}>{f.status === "ACCEPTED" ? "Approved" : f.status === "PENDING" ? "Pending review" : f.status === "DRAFT" ? "Draft" : "Returned"}</span>{f.supersedes && <span className="pill pill-muted">Replacement</span>}</strong>
              <span>{f.pdfFileName ?? "Document"} · {f.addedBy.displayName}</span>
              <details className="case-filing-details"><summary>Filing history and notes</summary>
                <ol className="filing-status-timeline" aria-label={`${f.title} status timeline`}>
                  <li><span>Submitted</span><time dateTime={f.submittedAt?.toISOString()}>{f.submittedAt ? dateTimeFormatter.format(f.submittedAt) : f.status === "DRAFT" ? `Draft saved ${dateTimeFormatter.format(f.createdAt)}` : "Date unavailable"}</time></li>
                  <li><span>{f.status === "REJECTED" ? "Returned" : f.status === "ACCEPTED" ? "Approved" : f.status === "DRAFT" ? "Awaiting submission" : "Awaiting review"}</span><time>{f.reviewedAt ? dateTimeFormatter.format(f.reviewedAt) : "Not recorded"}</time></li>
                  <li><span>Filed with court</span><time>{f.filedAt ? dateTimeFormatter.format(f.filedAt) : "Not recorded"}</time>{f.courtFilingUrl && <a href={f.courtFilingUrl} target="_blank" rel="noreferrer noopener">Court source ↗</a>}</li>
                </ol>
                {f.status === "PENDING" && <p className="filing-gap-alert">Submitted for portal review. The approval date will appear when a reviewer acts.</p>}
                {f.status === "ACCEPTED" && !f.filedAt && <p className="filing-gap-alert">Approved in the portal. Mark it filed after filing it with the court.</p>}
                {f.supersedes && <p>Replaces: {f.supersedes.title}</p>}{f.revisionNote && <p className="note-inline">{f.revisionNote}</p>}{f.revisions.length > 0 && <p>Replacement submitted: {f.revisions.map((revision) => `${revision.title} (${revision.status.toLowerCase()})`).join(", ")}</p>}{f.reviewNote && f.status !== "ACCEPTED" && <p className="note-inline">Review note: {f.reviewNote}</p>}
              </details>
            </div>
            <div className="case-filing-actions">
              {f.pdfFileName && <a href={`/api/cases/filings/${f.id}/pdf`} target="_blank" rel="noreferrer noopener" className="govbtn-outline">PDF</a>}
              {f.url && <a href={f.url} target="_blank" rel="noreferrer noopener" className="govbtn-outline">Source</a>}
              {canFileCourt && f.status === "ACCEPTED" && !f.filedAt && <form action={recordAdditionalCourtFiling}><input type="hidden" name="filingId" value={f.id}/><PendingSubmitButton label="Filed in Court" pendingLabel="Saving…" className="govbtn-outline"/></form>}
              {((f.status === "PENDING" && f.addedById === user.id) || (f.status !== "PENDING" && canEdit)) && <RemoveButton id={f.id} action={deleteFiling} label={f.status === "PENDING" ? "Withdraw" : "Remove"} confirmMessage={`${f.status === "PENDING" ? "Withdraw" : "Remove"} the filing “${f.title}”?`} className="linklike case-filing-remove" />}
            </div>
          </li>
        ))}
      </ul>}
    </section>
  );

  const activitySection = (
    <details className="case-detail-fold" id="activity">
      <summary><h2>History</h2><span>{caseRecord.comments.length} entries</span></summary>
      <div className="case-detail-fold-body">
      <div className="comment-log">
        {caseRecord.comments.length === 0 ? (
          <div className="comment-item">No updates yet.</div>
        ) : (
          caseRecord.comments.map((c) => (
            <div key={c.id} className={`comment-item${c.isSystem ? " system" : ""}`}>
              <div className="comment-meta">
                {c.isSystem ? "System history" : c.author?.displayName ?? "Unknown"} &middot; {dateTimeFormatter.format(c.createdAt)}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
            </div>
          ))
        )}
      </div>
      <form action={addComment} className="field-row">
        <input type="hidden" name="caseId" value={caseRecord.id} />
        <div className="field" style={{ flex: "1 1 100%" }}>
          <label htmlFor="case-update-body">Case update</label><textarea id="case-update-body" name="body" rows={2} maxLength={4000} placeholder="Add a case update…" required />
        </div>
        <button type="submit" className="govbtn-outline">
          Post Update
        </button>
      </form>
      </div>
    </details>
  );

  const deadlinesSection = (
    <details className="case-detail-fold" id="deadlines">
      <summary><h2>Case dates</h2><span>{caseRecord.events.length} scheduled</span></summary>
      <div className="case-detail-fold-body">
        <section className="case-subsection" id="timeline"><div className="case-subsection-heading"><div><p className="eyebrow">Hearings and office dates</p><h3>Case calendar</h3></div><div className="case-subsection-actions"><span>{caseRecord.events.length}</span><Link href="/dashboard/cases/calendar">Open calendar</Link></div></div>
          {caseRecord.events.length ? <ol className="workbench-event-list">{caseRecord.events.map((event) => <li key={event.id}><span className={`pill ${event.isCourtOrdered ? "pill-navy" : "pill-gold"}`}>{event.isCourtOrdered ? "Court ordered" : "Office target"}</span><time dateTime={event.startsAt.toISOString()}>{dateTimeFormatter.format(event.startsAt)}</time><strong>{event.title}</strong><p>{event.details || event.kind.replaceAll("_", " ")}</p>{event.sourceUrl && <a href={event.sourceUrl} target="_blank" rel="noreferrer noopener">Open source ↗</a>}</li>)}</ol> : <p className="note-inline">No case-specific dates have been added.</p>}
          {canEdit && <details className="workbench-form-fold"><summary>Add a hearing, order, or office target</summary><form action={addCaseEvent} className="workbench-form"><input type="hidden" name="caseId" value={caseRecord.id}/><div className="field"><label htmlFor="event-title">Event title</label><input id="event-title" name="title" maxLength={180} required/></div><div className="field"><label htmlFor="event-kind">Event type</label><select name="kind" id="event-kind"><option value="COURT_HEARING">Court hearing</option><option value="COURT_DEADLINE">Court deadline</option><option value="OFFICE_TARGET">Office target</option><option value="OTHER">Other</option></select></div><div className="field"><label htmlFor="event-date">Date and time</label><input id="event-date" name="startsAt" type="datetime-local" required/></div><div className="field"><label htmlFor="event-url">Order / calendar source link</label><input id="event-url" name="sourceUrl" type="url" maxLength={2000}/></div><div className="field field-wide"><label htmlFor="event-details">Details</label><textarea id="event-details" name="details" rows={2} maxLength={4000}/></div><label className="checkbox-row"><input type="checkbox" name="isCourtOrdered"/> Court-ordered date</label><button className="govbtn" type="submit">Add event</button></form></details>}
        </section>
      </div>
    </details>
  );

  const courtFilingSection = (
    <section className="case-court-filing" id="court-filing" aria-labelledby="court-filing-title">
      <div className="case-court-filing-heading"><div><p className="eyebrow">Opening filing</p><h2 id="court-filing-title">Court filing record</h2></div></div>
      {chargesFiledByStatus && <p className="note-inline">The case status has reached or passed “Charges Filed,” so that milestone is marked complete. Complaint submission and the actual court filing date remain tracked separately.</p>}
      {effectiveCourtFiledAt ? <p>Filed {dateTimeFormatter.format(effectiveCourtFiledAt)}{caseRecord.courtDocketUrl ? <> · <a href={caseRecord.courtDocketUrl} target="_blank" rel="noreferrer noopener">Open court record ↗</a></> : null}</p>
        : acceptedInitial ? <><p>Approved in the portal {acceptedInitialFiling?.reviewedAt ? dateTimeFormatter.format(acceptedInitialFiling.reviewedAt) : ""}. Once you file the opening document with the court, mark it below.</p>{canFileCourt && <form action={recordCourtFiling} className="case-court-filing-form"><input type="hidden" name="caseId" value={caseRecord.id}/><PendingSubmitButton label="Filed in Court" pendingLabel="Saving…" className="govbtn"/></form>}</>
          : pendingInitial ? <p>The opening filing is in the Review Inbox. Portal approval will not mark it as filed with the court.</p>
            : returnedInitial ? <p className="note-inline">The opening filing was returned{returnedInitial.reviewNote ? `: ${returnedInitial.reviewNote}` : ". Replace the PDF and submit it for review again."}</p>
        : <p>This staff case record has not been filed with the court.</p>}
      {!effectiveCourtFiledAt && !pendingInitial && !acceptedInitial && canFileCourt && <form action={fileCase} className="case-court-filing-form" encType="multipart/form-data">
        <input type="hidden" name="caseId" value={caseRecord.id} />
        <div className="field"><label htmlFor="court-filing-source">Choose an attached PDF filing</label><select id="court-filing-source" name="sourceFilingId" required defaultValue={draftInitial?.id ?? returnedInitial?.id ?? ""}><option value="" disabled>Select a filing…</option>{draftInitial && <option value={draftInitial.id}>{draftInitial.title} — saved draft</option>}{returnedInitial && <option value={returnedInitial.id}>{returnedInitial.title} — returned filing</option>}{reusableCourtFilings.map((filing) => <option key={filing.id} value={filing.id}>{filing.title} — {filing.pdfFileName ?? "PDF"}</option>)}</select></div>
        <p className="note-inline">The selected PDF must already be attached to this case. To add one, use the Filings section first.</p>
        <div className="field"><label htmlFor="court-filing-document-title">Complaint / initial filing title <span className="hint">Optional</span></label><input id="court-filing-document-title" name="initialFilingTitle" maxLength={200} defaultValue={returnedInitial?.title ?? draftInitial?.title ?? ""} placeholder="Uses the selected filing title if blank" /></div>
        <PendingSubmitButton label={shouldRequireFilingApproval(session.user.tiers, caseRecord.division) ? "Submit for filing review" : "File with court"} pendingLabel="Submitting…" className="govbtn" />
      </form>}
    </section>
  );

  const filingsEvidenceSection = <details className="case-detail-fold" id="filings" open>
    <summary><h2>Filings &amp; evidence</h2><span>{visibleFilings.length + caseRecord.aopcs.length + caseRecord.evidence.length} records</span></summary>
    <div className="case-detail-fold-body">
      {courtFilingSection}
      <section className="case-subsection" aria-labelledby="initial-documents-title"><div className="case-subsection-heading"><div><p className="eyebrow">Opening documents</p><h3 id="initial-documents-title">Opening filing and AOPC</h3></div><span>{initialFilings.length + aopcFilings.length + caseRecord.aopcs.length}</span></div>
        {initialFilings.length === 0 && aopcFilings.length === 0 && caseRecord.aopcs.length === 0 ? <p className="note-inline">No opening filing or linked AOPC/report is recorded.</p> : <ul className="case-source-list">
          {initialFilings.map((filing) => <li key={filing.id}><div><strong>{filing.title}</strong><span>Opening filing · {filing.status === "ACCEPTED" ? "Approved" : filing.status === "PENDING" ? "Awaiting review" : filing.status === "REJECTED" ? "Returned" : "Draft"}{filing.filedAt || caseRecord.courtFiledAt ? ` · Filed ${dateTimeFormatter.format(filing.filedAt ?? caseRecord.courtFiledAt!)}` : " · Not marked filed in court"}</span></div><div className="case-filing-actions">{filing.pdfFileName && <a className="govbtn-outline" href={`/api/cases/filings/${filing.id}/pdf`} target="_blank" rel="noreferrer noopener">PDF</a>}{filing.url && <a className="govbtn-outline" href={filing.url} target="_blank" rel="noreferrer noopener">Source</a>}</div></li>)}
          {aopcFilings.map((filing) => <li key={`aopc-filing-${filing.id}`}><div><strong>{filing.title}</strong><span>AOPC · {filing.status === "ACCEPTED" ? "Approved" : filing.status === "PENDING" ? "Awaiting review" : filing.status === "REJECTED" ? "Returned" : "Draft"}{filing.filedAt ? ` · Filed ${dateTimeFormatter.format(filing.filedAt)}` : " · Court filing not recorded"}</span></div><div className="case-filing-actions">{filing.pdfFileName && <a className="govbtn-outline" href={`/api/cases/filings/${filing.id}/pdf`} target="_blank" rel="noreferrer noopener">PDF</a>}{filing.url && <a className="govbtn-outline" href={filing.url} target="_blank" rel="noreferrer noopener">Source</a>}</div></li>)}
          {caseRecord.aopcs.map((aopc) => <li key={`aopc-${aopc.id}`}><div><strong>{aopc.reportId ?? aopc.title}</strong><span>{aopc.documentType === "INVESTIGATIVE_REPORT" ? "Investigative report" : "AOPC"} · {aopc.status === "ACCEPTED" ? "Approved" : aopc.status === "PENDING" ? "Awaiting review" : aopc.status} · {aopc.subject}</span>{aopc.reviewNote && <small>{aopc.reviewNote}</small>}</div><div className="case-filing-actions">{aopc.pdfFileName && <a className="govbtn-outline" href={`/api/aopcs/${aopc.id}/pdf`} target="_blank" rel="noreferrer noopener">PDF</a>}{aopc.documentUrl && <a className="govbtn-outline" href={aopc.documentUrl} target="_blank" rel="noreferrer noopener">Source</a>}</div></li>)}
        </ul>}
      </section>
      {otherFilingsSection}
      <section className="case-subsection" id="evidence"><div className="case-subsection-heading"><div><p className="eyebrow">Source register</p><h3>Evidence and transcripts</h3></div><span>{caseRecord.evidence.length}</span></div>
        <p className="note-inline">Source links and transcript records attached to this case.</p>
        {caseRecord.evidence.length ? <div className="evidence-register">{caseRecord.evidence.map((item) => <article key={item.id}><span className={`pill ${item.kind === "VIDEO" || item.kind === "PHOTOGRAPH" ? "pill-gold" : "pill-muted"}`}>{item.kind.replaceAll("_", " ")}</span><strong>{item.title}</strong><span>{item.sourceName || "Source not recorded"} · Received {courtDateFormatter.format(item.receivedAt)}</span>{item.fileName && <span>File: {item.fileName}</span>}{item.sha256 && <code>SHA-256 {item.sha256}</code>}{item.notes && <details className="case-filing-details"><summary>Notes / transcript text</summary><p className="case-evidence-notes">{item.notes}</p></details>}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">Open source ↗</a>}</article>)}</div> : <p className="note-inline">No evidence or transcript sources are linked.</p>}
        {canEdit && <details className="workbench-form-fold"><summary>Add source or transcript</summary><form action={addCaseEvidence} className="workbench-form" encType="multipart/form-data"><input type="hidden" name="caseId" value={caseRecord.id}/><div className="field"><label htmlFor="evidence-title">Record title</label><input id="evidence-title" name="title" maxLength={180} required/></div><div className="field"><label htmlFor="evidence-kind">Record type</label><select name="kind" id="evidence-kind"><option value="DOCUMENT">Document</option><option value="TEXT_RECORD">Written evidence notes</option><option value="COURT_TRANSCRIPT">Court transcript</option><option value="PHOTOGRAPH">Photograph</option><option value="VIDEO">Video</option><option value="OTHER">Other</option></select></div><div className="field"><label htmlFor="evidence-source">Source / author</label><input id="evidence-source" name="sourceName" maxLength={180}/></div><div className="field"><label htmlFor="evidence-file">Original filename</label><input id="evidence-file" name="fileName" maxLength={180}/></div><div className="field"><label htmlFor="evidence-date">Received date</label><input id="evidence-date" name="receivedAt" type="date"/></div><div className="field"><label htmlFor="evidence-sha">SHA-256 hash <span className="hint">Optional</span></label><input id="evidence-sha" name="sha256" pattern="[A-Fa-f0-9]{64}" maxLength={64}/></div><div className="field field-wide"><label htmlFor="evidence-url">Source or Discord message link</label><input id="evidence-url" name="sourceUrl" type="url" maxLength={2000} placeholder="https://discord.com/channels/..."/></div><div className="field field-wide"><label htmlFor="evidence-notes">Staff notes or transcript text</label><textarea id="evidence-notes" name="notes" rows={4} maxLength={20000}/></div><div className="field field-wide"><label htmlFor="transcript-file">Import exported transcript (.txt) <span className="hint">Text only · 2 MB max</span></label><input id="transcript-file" name="transcriptFile" type="file" accept=".txt,text/plain"/></div><label className="checkbox-row"><input type="checkbox" name="confirmCaseAssociation" required/> I reviewed the source and confirm it belongs on this case.</label><button className="govbtn" type="submit">Add source</button></form></details>}
      </section>
    </div>
  </details>;

  const now = new Date();
  const nextEvent = caseRecord.events.find((event) => event.startsAt.getTime() >= now.getTime());
  const nextCaseDate = nextEvent?.startsAt ?? null;
  const nextStep = pendingInitial
    ? "Initial filing is waiting for review. Its status will update when a reviewer decides."
    : acceptedInitial && !isCourtFiled
    ? "The opening filing is approved in the portal. Mark it filed after filing it with the court."
    : returnedInitial && !isCourtFiled
    ? "The opening filing was returned. Correct the PDF and resubmit it for review."
      : !isCourtFiled
        ? canFileCourt ? "File the opening document to move this case into the court docket." : "This case is waiting for an authorized staff member to file the opening document."
        : nextCaseDate
              ? `Next scheduled date: ${courtDateFormatter.format(nextCaseDate)}.`
              : "Court filing is complete. Add hearing dates or case tasks when the court or office sets them.";
  const caseHeader = <><nav className="breadcrumb"><Link href="/dashboard/cases">Case docket</Link><span aria-hidden="true">/</span><span>{caseRecord.caseNumber}</span></nav><header className="case-workspace-header">
    <div className="case-workspace-title">
      <div><p className="eyebrow">Case {caseRecord.caseNumber}</p><h1>{caseRecord.title}</h1><p className="subtitle">{caseRecord.type ?? "Case"} · Opened {courtDateFormatter.format(caseRecord.createdAt)}</p></div>
      <div className="case-workspace-badges"><span className={`pill ${caseRecord.archived ? "pill-muted" : `pill-${statusColor}`}`}>{caseRecord.archived ? "Archived" : caseRecord.stage ?? "No case status"}</span><span className={`pill pill-${courtFilingColor}`}>{courtFilingLabel}</span>{caseRecord.isDraft && <span className="pill pill-muted">Internal draft</span>}</div>
    </div>
    <dl className="case-workspace-facts">
      <div><dt>Assigned attorney</dt><dd>{caseRecord.assignedAttorney?.displayName ?? "Unassigned"}</dd></div>
      <div><dt>Assigned judge</dt><dd>{caseRecord.assignedJudge ?? "Not assigned"}</dd></div>
      <div><dt>Division</dt><dd>{caseRecord.division ?? "Not assigned"}</dd></div>
      <div><dt>Next date</dt><dd>{nextCaseDate ? courtDateFormatter.format(nextCaseDate) : "None scheduled"}</dd></div>
    </dl>
    <div className="case-workspace-next"><div><strong>Next step</strong><p>{nextStep}</p></div><div className="case-workspace-actions">
      {!isCourtFiled && !pendingInitial && canFileCourt ? <CaseSectionLink href="#court-filing" className="govbtn">{acceptedInitial ? "Record court filing" : returnedInitial ? "Correct initial filing" : "Review initial filing"}</CaseSectionLink>
        : nextCaseDate ? <CaseSectionLink href="#deadlines" className="govbtn">Review next date</CaseSectionLink>
            : isCourtFiled && canFileDocument ? <Link href={`/dashboard/filings/new?caseId=${caseRecord.id}`} className="govbtn">File a document</Link> : null}
      <details className="case-more-actions"><summary>Actions</summary><div>
        {canEdit && <CaseSectionLink href="#edit-case">Edit case</CaseSectionLink>}
        {canPropose && <CaseSectionLink href="#propose-edit">Propose an edit</CaseSectionLink>}
        <Link href={`/dashboard/cases/${caseRecord.id}/handoff`}>Prepare handoff</Link>
        <a href={`/api/dashboard/cases/${caseRecord.id}/packet`}>Download case packet</a>
        {session.user.tiers.includes("developer_profile") && <Link href={`/dashboard/templates?caseId=${caseRecord.id}`}>Create a DA document</Link>}
      </div></details>
    </div></div>
  </header></>;
  const caseOverview = <details className="case-detail-fold" id="overview" open>
    <summary><h2>Overview</h2><span>{openTasks.length} open task{openTasks.length === 1 ? "" : "s"}</span></summary>
    <div className="case-detail-fold-body">
      {(!caseRecord.assignedAttorney || pendingInitial || returnedInitial) && <section className="case-attention-panel" aria-labelledby="case-attention-title"><h3 id="case-attention-title">Needs attention</h3><ul>
        {!caseRecord.assignedAttorney && <li>Case has no assigned attorney. <CaseSectionLink href="#edit-case">Assign an attorney</CaseSectionLink></li>}
        {pendingInitial && <li>Initial filing is waiting for portal review. <CaseSectionLink href="#court-filing">View filing status</CaseSectionLink></li>}
        {returnedInitial && <li>Initial filing was returned. <CaseSectionLink href="#court-filing">Review the return note</CaseSectionLink></li>}
      </ul></section>}
      <div className="case-overview-grid"><div><small>Assigned attorney</small><strong>{caseRecord.assignedAttorney?.displayName ?? "Unassigned"}</strong></div><div><small>Assigned judge</small><strong>{caseRecord.assignedJudge ?? "Not assigned"}</strong></div><div><small>Division / group</small><strong>{[caseRecord.division, caseRecord.divisionGroup ? `Group ${caseRecord.divisionGroup}` : null].filter(Boolean).join(" · ") || "Not assigned"}</strong></div><div><small>Submitted by</small><strong>{caseRecord.createdBy.displayName}</strong></div></div>
      {caseRecord.summary && <div className="case-overview-notes"><h3>Case summary</h3><p>{caseRecord.summary}</p></div>}
      <section className="case-subsection" id="people"><div className="case-subsection-heading"><div><p className="eyebrow">Parties</p><h3>People</h3></div><span>{parties.length}</span></div>{parties.length ? <ul className="case-parties">{parties.map((party, index) => <li key={`${party.name}-${index}`}><strong>{party.role}</strong><span>{party.name}</span></li>)}</ul> : <p className="note-inline">No people or parties have been listed.</p>}</section>
      <section className="case-subsection" id="related"><div className="case-subsection-heading"><div><p className="eyebrow">Connected records</p><h3>Related cases</h3></div><span>{relatedCases.length}</span></div>{relatedCases.length ? <ul className="case-related-list">{relatedCases.map((relatedCase) => <li key={relatedCase.id}><Link href={`/dashboard/cases/${relatedCase.id}`}>{relatedCase.caseNumber} · {relatedCase.title}</Link></li>)}</ul> : <p className="note-inline">No related cases.</p>}</section>
      <section className="case-subsection" id="tasks"><div className="case-subsection-heading"><div><p className="eyebrow">Follow-up</p><h3>Case tasks</h3></div><span>{openTasks.length} open</span></div>
        {caseRecord.tasks.length ? <ul className="workbench-existing-tasks">{caseRecord.tasks.map((task) => <li key={task.id}><div><strong>{task.title}</strong><p>{task.details || "No further details."}</p><small>{task.status === "SUBMITTED" ? "Draft submitted for attorney review" : task.status.replaceAll("_", " ")} · {task.assignedToName ?? "Unassigned"}{task.dueAt ? ` · Due ${courtDateFormatter.format(task.dueAt)}` : ""}{task.sourceReference ? ` · ${task.sourceReference}` : ""}</small></div>{canEdit && task.status === "OPEN" && <div className="workbench-task-actions"><form action={updateCaseTask}><input type="hidden" name="taskId" value={task.id}/><button className="linklike" name="status" value="DONE">Mark done</button></form><form action={updateCaseTask}><input type="hidden" name="taskId" value={task.id}/><button className="linklike" name="status" value="DISMISSED">Dismiss</button></form></div>}</li>)}</ul> : <p className="note-inline">No case tasks have been added.</p>}
        {canEdit && caseRecord.tasks.filter((task) => task.status === "SUBMITTED").map((task) => <article className="paralegal-review-card" key={`draft-${task.id}`}><h4>{task.title} · {task.assignedToName}</h4><pre>{task.draftText}</pre><form action={updateCaseTask} className="paralegal-return-form"><input type="hidden" name="taskId" value={task.id}/><label htmlFor={`return-note-${task.id}`}>Return note, required if requesting revisions</label><textarea id={`return-note-${task.id}`} name="reviewNote" rows={2} maxLength={1200}/><button className="govbtn-outline" name="status" value="OPEN">Return for revision</button><button className="govbtn" name="status" value="DONE">Accept and complete task</button></form></article>)}
        {canEdit && <details className="workbench-form-fold"><summary>Add a case task</summary><form action={addCaseTask} className="workbench-form"><input type="hidden" name="caseId" value={caseRecord.id}/><div className="field"><label htmlFor="task-title">Task</label><input id="task-title" name="title" maxLength={180} required/></div><div className="field"><label htmlFor="task-assignee">Assign to</label><select id="task-assignee" name="assigneeId"><option value="">Unassigned</option>{attorneys.map((attorney) => <option key={attorney.id} value={attorney.id}>{attorney.displayName}</option>)}</select></div><div className="field field-wide"><label htmlFor="task-details">Details</label><textarea id="task-details" name="details" rows={2} maxLength={1500}/></div><div className="field field-wide"><label htmlFor="task-source">Source reference <span className="hint">Optional</span></label><input id="task-source" name="sourceReference" maxLength={500}/></div><button className="govbtn" type="submit">Add task</button></form></details>}
      </section>
    </div>
  </details>;
  const caseNavigation = <nav className="case-section-nav" aria-label="Case sections">
    <CaseSectionLink href="#overview">Overview</CaseSectionLink><CaseSectionLink href="#filings">Filings & evidence</CaseSectionLink><CaseSectionLink href="#deadlines">Case dates</CaseSectionLink><CaseSectionLink href="#activity">History</CaseSectionLink>{canEdit ? <CaseSectionLink href="#edit-case">Edit case</CaseSectionLink> : canPropose ? <CaseSectionLink href="#propose-edit">Propose edit</CaseSectionLink> : null}
  </nav>;

  if (!canEdit) {
    return (
      <div>
        <CaseFoldPersistence accountId={user.id} caseId={caseRecord.id} />
        {caseHeader}
        {caseNavigation}
        {caseOverview}
        {filingsEvidenceSection}
        {deadlinesSection}
        {activitySection}

        {canPropose && (
          <details className="case-detail-fold" id="propose-edit">
            <summary><h2>Propose a case edit</h2><span>Send for review</span></summary>
            <div className="case-detail-fold-body">
            <p className="note-inline">Submitted for review by office leadership before it takes effect.</p>
            <form action={submitCaseRequest} className="formbox" style={{ border: 0, padding: 0 }}>
              <input type="hidden" name="caseId" value={caseRecord.id} />
              <div className="field-row">
                <div className="field">
                  <label htmlFor="p-title">Case Title</label>
                  <input type="text" id="p-title" name="title" required maxLength={200} defaultValue={caseRecord.title} />
                </div>
                <div className="field">
                  <label htmlFor="p-caseNumber">Case #</label>
                  <input
                    type="text"
                    id="p-caseNumber"
                    name="caseNumber"
                    required
                    maxLength={50}
                    defaultValue={caseRecord.caseNumber}
                  />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="p-type">Type</label>
                  <input type="text" id="p-type" name="type" maxLength={100} defaultValue={caseRecord.type ?? ""} />
                </div>
                <div className="field">
                  <label htmlFor="p-stage">Status</label>
                  <select id="p-stage" name="stage" defaultValue={caseRecord.stage ?? ""}>
                    <option value="">No status set</option>
                    {caseStatuses.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <input type="hidden" name="summary" value={caseRecord.summary} />
              <input type="hidden" name="disclosures" value={caseRecord.disclosures ?? ""} />
              <input type="hidden" name="initialFilingDue" value={toDateInputValue(caseRecord.initialFilingDue)} />
              <input type="hidden" name="discGiven" value={toDateInputValue(caseRecord.discGiven)} />
              <input type="hidden" name="discDue" value={toDateInputValue(caseRecord.discDue)} />
              <input type="hidden" name="pretrial" value={toDateInputValue(caseRecord.pretrial)} />
              <input type="hidden" name="otherDates" value={caseRecord.otherDates ?? ""} />
              <input type="hidden" name="outcome" value={caseRecord.outcome ?? ""} />
              <input type="hidden" name="closedOn" value={toDateInputValue(caseRecord.closedOn)} />
              <input type="hidden" name="appealBy" value={toDateInputValue(caseRecord.appealBy)} />
              <input type="hidden" name="arraignmentAt" value={toDateInputValue(caseRecord.arraignmentAt)} />
              <input type="hidden" name="proofOfServiceAt" value={toDateInputValue(caseRecord.proofOfServiceAt)} />
              <input type="hidden" name="discoveryOrderAt" value={toDateInputValue(caseRecord.discoveryOrderAt)} />
              <input type="hidden" name="discoveryRequestedAt" value={toDateInputValue(caseRecord.discoveryRequestedAt)} />
              <input type="hidden" name="motionServedAt" value={toDateInputValue(caseRecord.motionServedAt)} />
              <input type="hidden" name="verdictAt" value={toDateInputValue(caseRecord.verdictAt)} />
              <input type="hidden" name="sentenceAt" value={toDateInputValue(caseRecord.sentenceAt)} />
              <input type="hidden" name="finalJudgmentAt" value={toDateInputValue(caseRecord.finalJudgmentAt)} />
              <button type="submit" className="govbtn">
                Submit for Review
              </button>
            </form>
          </div>
          </details>
        )}
      </div>
    );
  }

  return (
      <div>
      <CaseFoldPersistence accountId={user.id} caseId={caseRecord.id} />
      {caseHeader}
      {caseNavigation}
      {caseOverview}
      <details className="case-detail-fold" id="edit-case">
        <summary><h2>Manage case</h2><span>Assignment, status, and case dates</span></summary>
        <div className="case-detail-fold-body">
      <form action={updateCase} className="formbox case-edit-form">
        <div className="case-edit-heading"><div><p className="eyebrow">Case management</p><p className="lede">Update the case record, assignment, and key dates.</p></div><span className={`pill ${caseRecord.stage ? `pill-${statusColor}` : "pill-muted"}`}>{caseRecord.stage ?? "No status set"}</span></div>
        <input type="hidden" name="id" value={caseRecord.id} />
        <input type="hidden" name="summary" value={caseRecord.summary} />
        <input type="hidden" name="arraignmentAt" value={toDateInputValue(caseRecord.arraignmentAt)} />
        <input type="hidden" name="proofOfServiceAt" value={toDateInputValue(caseRecord.proofOfServiceAt)} />
        <input type="hidden" name="discoveryOrderAt" value={toDateInputValue(caseRecord.discoveryOrderAt)} />
        <input type="hidden" name="discoveryRequestedAt" value={toDateInputValue(caseRecord.discoveryRequestedAt)} />
        <input type="hidden" name="motionServedAt" value={toDateInputValue(caseRecord.motionServedAt)} />
        <input type="hidden" name="verdictAt" value={toDateInputValue(caseRecord.verdictAt)} />
        <input type="hidden" name="sentenceAt" value={toDateInputValue(caseRecord.sentenceAt)} />
        <input type="hidden" name="finalJudgmentAt" value={toDateInputValue(caseRecord.finalJudgmentAt)} />
        <details className="case-edit-subfold" id="case-information" open>
          <summary>Case information <span>Title, status, attorney, and judge</span></summary>
        <fieldset className="case-edit-section">
          <legend className="sr-only">Case information</legend>
        <div className="field-row">
          <div className="field">
            <label htmlFor="title">Case Title</label>
            <input type="text" id="title" name="title" required maxLength={200} defaultValue={caseRecord.title} />
          </div>
          <div className="field">
            <label htmlFor="caseNumber">Case #</label>
            <input
              type="text"
              id="caseNumber"
              name="caseNumber"
              required
              maxLength={50}
              defaultValue={caseRecord.caseNumber}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="type">Case type</label>
            <input type="text" id="type" name="type" maxLength={100} defaultValue={caseRecord.type ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="stage">Status</label>
            <select id="stage" name="stage" defaultValue={caseRecord.stage ?? ""}>
              <option value="">No status set</option>
              {caseStatuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="assignedAttorneyId">Assigned attorney</label>
            {canAssign ? (
              <select
                id="assignedAttorneyId"
                name="assignedAttorneyId"
                defaultValue={caseRecord.assignedAttorneyId ?? ""}
              >
                <option value="">Unassigned</option>
                {attorneys.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" value={caseRecord.assignedAttorney?.displayName ?? "Unassigned"} disabled />
            )}
            </div>
          <div className="field"><label htmlFor="assignedJudge">Assigned judge</label><input type="text" id="assignedJudge" name="assignedJudge" maxLength={120} defaultValue={caseRecord.assignedJudge ?? ""} /></div>
        </div>
        </fieldset>
        </details>

        <details className="case-edit-subfold" id="case-dates">
          <summary>Dates and disclosures <span>Manually entered deadlines and case dates</span></summary>
        <fieldset className="case-edit-section">
          <legend className="sr-only">Dates and disclosures</legend>
        <div className="field">
            <label htmlFor="disclosures">Disclosure notes</label>
          <input
            type="text"
            id="disclosures"
            name="disclosures"
            maxLength={2000}
            defaultValue={caseRecord.disclosures ?? ""}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="initialFilingDue">Filing / portal reconciliation target</label>
            <input type="date" id="initialFilingDue" name="initialFilingDue" defaultValue={toDateInputValue(caseRecord.initialFilingDue)} />
            <small>Internal office target only. Not a court deadline. Reconcile an externally filed case instead of filing it again.</small>
          </div>
          <div className="field">
            <label htmlFor="discGiven">Discovery provided</label>
            <input type="date" id="discGiven" name="discGiven" defaultValue={toDateInputValue(caseRecord.discGiven)} />
          </div>
          <div className="field">
            <label htmlFor="discDue">Manual discovery deadline</label>
            <input type="date" id="discDue" name="discDue" defaultValue={toDateInputValue(caseRecord.discDue)} />
          </div>
          <div className="field">
            <label htmlFor="pretrial">Pretrial</label>
            <input type="date" id="pretrial" name="pretrial" defaultValue={toDateInputValue(caseRecord.pretrial)} />
          </div>
        </div>
        </fieldset>
        </details>

        <details className="case-edit-subfold" id="case-outcome">
          <summary>Outcome and related cases <span>Closure, appeals, and linked records</span></summary>
        <fieldset className="case-edit-section">
          <legend className="sr-only">Outcome and related cases</legend>
        <div className="field">
            <label htmlFor="otherDates">Other date notes</label>
          <input
            type="text"
            id="otherDates"
            name="otherDates"
            maxLength={500}
            defaultValue={caseRecord.otherDates ?? ""}
          />
        </div>

        <div className="field">
          <label htmlFor="outcome">Outcome</label>
          <input type="text" id="outcome" name="outcome" maxLength={500} defaultValue={caseRecord.outcome ?? ""} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="closedOn">Closed On</label>
            <input type="date" id="closedOn" name="closedOn" defaultValue={toDateInputValue(caseRecord.closedOn)} />
          </div>
          <div className="field">
            <label htmlFor="appealBy">Manual appeal deadline</label>
            <input type="date" id="appealBy" name="appealBy" defaultValue={toDateInputValue(caseRecord.appealBy)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="relatedCaseNumbers">
            Related Case Numbers <span className="hint">(optional. Separate multiple numbers with commas)</span>
          </label>
          <input
            type="text"
            id="relatedCaseNumbers"
            name="relatedCaseNumbers"
            maxLength={500}
            defaultValue={relatedCaseNumbersDefault}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}>
              <input type="checkbox" name="archived" defaultChecked={caseRecord.archived} />
              Archived
            </label>
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}>
              <input type="checkbox" name="isDraft" defaultChecked={caseRecord.isDraft} />
              Draft (only visible to you and office leadership)
            </label>
          </div>
        </div>
        </fieldset>
        </details>

        <div className="case-edit-actions"><Link href={`/dashboard/cases/${caseRecord.id}`} className="govbtn-outline">Cancel</Link><button type="submit" className="govbtn">Save Changes</button></div>
      </form>
        </div>
      </details>

      {filingsEvidenceSection}
      {deadlinesSection}
      {activitySection}

      {canDelete && (
        <details className="case-detail-fold case-danger-zone" id="advanced-actions">
          <summary><h2>Advanced actions</h2><span>Permanent deletion</span></summary>
          <div className="case-detail-fold-body"><p className="note-inline">Deleting this case also deletes its filings, updates, and related requests. This cannot be undone.</p><RemoveButton id={caseRecord.id} action={deleteCase} label="Delete case" confirmMessage={`Permanently delete case ${caseRecord.caseNumber} and its filings, comments, and requests?`} className="govbtn case-delete-button" /></div>
        </details>
      )}
    </div>
  );
}

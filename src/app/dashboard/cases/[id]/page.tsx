import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser, canAccessCase, canViewCases, canEditCase, canAssignCase, canReviewDivision } from "@/lib/case-access";
import { CASE_STATUSES, caseStatusColor } from "@/config/case-statuses";
import { updateCase, deleteCase, deleteFiling, addComment, fileCase } from "../actions";
import { submitCaseRequest } from "../requests/actions";
import { getSiteConfiguration } from "@/lib/site-settings";
import { RemoveButton } from "@/components/remove-button";
import { PdfUploadInput } from "@/components/pdf-upload-input";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";
import { getOngoingObligations, getProceduralDeadlines, isCourtDeadlineOverdue } from "@/lib/procedural-deadlines";
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
    filings: { select: { id: true; title: true; url: true; pdfFileName: true; status: true; isInitial: true; reviewNote: true; addedById: true; createdAt: true; addedBy: { select: { displayName: true } } } };
    comments: { include: { author: true } };
    relatedTo: true;
    relatedFrom: true;
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
        filings: { select: { id: true, title: true, url: true, pdfFileName: true, status: true, isInitial: true, reviewNote: true, addedById: true, createdAt: true, addedBy: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } },
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
        relatedTo: true,
        relatedFrom: true,
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
  const visibleFilings = caseRecord.filings.filter((filing) => filing.status === "ACCEPTED" || filing.addedById === user.id || canReviewThisDivision);

  if (canEdit && canAssign) {
    try {
      attorneys = await getDivisionCaseAssignees(
        hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) ? null : caseRecord.division,
        { divisionGroup: user.divisionGroup, restrictToGroup: session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL) },
      );
    } catch (error) {
      console.error("Failed to load attorneys", error);
    }
  }

  const statusColor = caseStatusColor(caseRecord.stage);
  const relatedCasesMap = new Map<string, { id: string; caseNumber: string; title: string }>();
  for (const c of [...caseRecord.relatedTo, ...caseRecord.relatedFrom]) {
    relatedCasesMap.set(c.id, c);
  }
  const relatedCases = Array.from(relatedCasesMap.values());
  const relatedCaseNumbersDefault = caseRecord.relatedTo.map((c) => c.caseNumber).join(", ");
  const accessLabel = hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL)
    ? "Full docket access"
    : hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_DIVISION)
      ? `${user.division ?? "Unassigned"} division access`
    : canEdit ? "Edit access" : canPropose ? "Read and propose edits" : "Read access";
  const legacyInitialFiling = !caseRecord.filings.some((filing) => filing.isInitial)
    ? [...caseRecord.filings].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).find((filing) => filing.status === "ACCEPTED" && Math.abs(filing.createdAt.getTime() - caseRecord.createdAt.getTime()) <= 120_000)
    : undefined;
  const initialFilings = caseRecord.filings.filter((filing) => filing.isInitial);
  if (initialFilings.length === 0 && legacyInitialFiling) initialFilings.push(legacyInitialFiling);
  const pendingInitial = initialFilings.some((filing) => filing.status === "PENDING");
  const acceptedInitialFiling = initialFilings.find((filing) => filing.status === "ACCEPTED");
  const acceptedInitial = Boolean(acceptedInitialFiling);
  const draftInitial = initialFilings.find((filing) => filing.status === "DRAFT");
  const returnedInitial = initialFilings.find((filing) => filing.status === "REJECTED");
  const effectiveCourtFiledAt = caseRecord.courtFiledAt ?? acceptedInitialFiling?.createdAt ?? null;
  const courtFilingLabel = effectiveCourtFiledAt || acceptedInitial ? "Filed with court" : pendingInitial ? "Awaiting review" : returnedInitial ? "Returned for correction" : "Unfiled in court";
  const courtFilingColor = caseRecord.courtFiledAt || acceptedInitial ? "green" : pendingInitial ? "gold" : returnedInitial ? "red" : "muted";
  const activeDeadlines = getProceduralDeadlines({ ...caseRecord, courtFiledAt: effectiveCourtFiledAt });
  const ongoingObligations = getOngoingObligations(caseRecord);
  let parties: { name: string; role: string }[] = [];
  try {
    const parsedParties = JSON.parse(caseRecord.partyDetails) as unknown;
    if (Array.isArray(parsedParties)) parties = parsedParties.filter((item): item is { name: string; role: string } => Boolean(item) && typeof item.name === "string" && typeof item.role === "string");
  } catch {
    parties = [];
  }

  const relatedCasesSection = (
    <details className="case-detail-fold" id="related">
      <summary><h2>Related cases</h2><span>{relatedCases.length} linked</span></summary>
      <div className="case-detail-fold-body">
      {relatedCases.length === 0 ? <p className="note-inline">No related cases.</p> : <ul className="case-related-list">
        {relatedCases.map((c) => (
          <li key={c.id}>
            <Link href={`/dashboard/cases/${c.id}`}>
              {c.caseNumber} &mdash; {c.title}
            </Link>
          </li>
        ))}
      </ul>}
      </div>
    </details>
  );

  const filingsSection = (
    <details className="case-detail-fold" id="filings" open>
      <summary><h2>Filings</h2><span>{visibleFilings.length} visible</span></summary>
      <div className="case-detail-fold-body">
      {visibleFilings.length === 0 ? (
        <p className="note-inline">No filings attached.</p>
      ) : (
        <ul className="case-filings-list">
          {visibleFilings.map((f) => (
            <li className="case-filing-row" key={f.id}>
              <div className="case-filing-info"><strong>{f.title} <span className={`pill ${f.status === "ACCEPTED" ? "pill-green" : f.status === "PENDING" ? "pill-gold" : f.status === "DRAFT" ? "pill-muted" : "pill-red"}`}>{f.status === "ACCEPTED" ? "Approved" : f.status === "PENDING" ? "Pending approval" : f.status === "DRAFT" ? "Draft complaint" : "Returned"}</span>{f.isInitial && <span className="pill pill-navy">Initial</span>}</strong><span>{f.pdfFileName ?? "Document"} · Submitted by {f.addedBy.displayName} · {dateTimeFormatter.format(f.createdAt)}</span>{f.reviewNote && f.status !== "ACCEPTED" && <span className="note-inline">Review note: {f.reviewNote}</span>}</div>
              <div className="case-filing-actions">
                {f.pdfFileName && <a href={`/api/cases/filings/${f.id}/pdf`} target="_blank" rel="noreferrer noopener" className="govbtn-outline">View PDF</a>}
                {f.url && <a href={f.url} target="_blank" rel="noreferrer noopener" className="govbtn-outline">Open link</a>}
                {((f.status === "PENDING" && f.addedById === user.id) || (f.status !== "PENDING" && canEdit)) && <RemoveButton id={f.id} action={deleteFiling} label={f.status === "PENDING" ? "Withdraw" : "Remove"} confirmMessage={`${f.status === "PENDING" ? "Withdraw" : "Remove"} the filing “${f.title}”?`} className="linklike case-filing-remove" />}
              </div>
            </li>
          ))}
        </ul>
      )}
      </div>
    </details>
  );

  const activitySection = (
    <details className="case-detail-fold" id="activity">
      <summary><h2>Activity and updates</h2><span>{caseRecord.comments.length} entries</span></summary>
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
      <summary><h2>Deadlines</h2><span>{activeDeadlines.length + ongoingObligations.length} items</span></summary>
      <div className="case-detail-fold-body">
        {activeDeadlines.length === 0 && ongoingObligations.length === 0 ? <p>No deadlines recorded.</p> : <ul>{activeDeadlines.map((deadline) => {
          const overdue = isCourtDeadlineOverdue(deadline.dueDate);
          return <li key={deadline.key}><span className={overdue ? "deadline-overdue" : undefined}>{deadline.label}: {deadline.dueDate.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "America/New_York" })}{overdue ? " - OVERDUE" : ""}</span><small>{deadline.automatic ? `Calculated · ${deadline.authority}` : deadline.authority}</small></li>;
        })}{ongoingObligations.map((obligation) => <li key={obligation.key}><span>{obligation.label}</span><small>{obligation.authority} · Ongoing duty</small></li>)}</ul>}
      </div>
    </details>
  );

  const courtFilingSection = (
    <section className="case-court-filing" id="court-filing" aria-labelledby="court-filing-title">
      <div className="case-court-filing-heading"><div><p className="eyebrow">Court status</p><h2 id="court-filing-title">Initial case filing</h2></div><span className={`pill pill-${courtFilingColor}`}>{courtFilingLabel}</span></div>
      {effectiveCourtFiledAt ? <p>Filed {dateTimeFormatter.format(effectiveCourtFiledAt)}{caseRecord.assignedJudge ? "" : " · Assign a judge to calculate the arraignment schedule."}</p>
        : pendingInitial ? <p>The initial complaint is in the Review Inbox. The case will become court-filed when it is approved.</p>
          : returnedInitial ? <p className="note-inline">The initial complaint was returned{returnedInitial.reviewNote ? `: ${returnedInitial.reviewNote}` : ". Replace the PDF and submit it for review again."}</p>
            : <p>This staff case record has not been filed with the court. {caseRecord.assignedJudge ? "The arraignment predictor will start after filing." : "Assign a judge to start the arraignment predictor after filing."}</p>}
      {!effectiveCourtFiledAt && !pendingInitial && canFileCourt && <form action={fileCase} className="case-court-filing-form" encType="multipart/form-data">
        <input type="hidden" name="caseId" value={caseRecord.id} />
        <div className="field"><label htmlFor="court-filing-document-title">Complaint / initial filing title</label><input id="court-filing-document-title" name="initialFilingTitle" maxLength={200} defaultValue={returnedInitial?.title ?? draftInitial?.title ?? ""} placeholder="Initial complaint" /></div>
        <div className="field"><label htmlFor="court-filing-pdf">{draftInitial ? "Replace initial complaint PDF (optional)" : "Initial complaint PDF (max 5 MB)"}</label><PdfUploadInput id="court-filing-pdf" name="initialPdf" required={!draftInitial} /></div>
        {draftInitial && <p className="note-inline">Ready to file: {draftInitial.pdfFileName ?? draftInitial.title}. Leave the PDF empty to use this saved complaint.</p>}
        <PendingSubmitButton label={shouldRequireFilingApproval(session.user.tiers, caseRecord.division) ? "Submit for filing review" : "File with court"} pendingLabel="Submitting…" className="govbtn" />
      </form>}
    </section>
  );

  const isCourtFiled = Boolean(effectiveCourtFiledAt || acceptedInitial);
  const now = new Date();
  const overdueCount = activeDeadlines.filter((deadline) => isCourtDeadlineOverdue(deadline.dueDate, now)).length;
  const nextDeadline = activeDeadlines.find((deadline) => !isCourtDeadlineOverdue(deadline.dueDate, now));
  const nextStep = pendingInitial
    ? "Initial filing is waiting for review. Its status will update when a reviewer decides."
    : returnedInitial && !isCourtFiled
      ? "The complaint was returned. Correct the PDF and resubmit it for review."
      : !isCourtFiled
        ? canFileCourt ? "File the initial complaint to move this case into the court docket." : "This case is waiting for an authorized staff member to file the initial complaint."
        : !caseRecord.assignedJudge
          ? canEdit ? "Assign a judge to enable the arraignment schedule." : "A judge has not been assigned yet. Predicted court dates are paused."
          : overdueCount
            ? `${overdueCount} deadline${overdueCount === 1 ? " is" : "s are"} overdue. Review the deadlines below.`
            : nextDeadline
              ? `Next deadline: ${nextDeadline.label} on ${courtDateFormatter.format(nextDeadline.dueDate)}.`
              : "Court filing is complete. Continue casework using the sections below.";
  const caseHeader = <header className="case-workspace-header">
    <div className="case-workspace-title">
      <div><p className="eyebrow">Case {caseRecord.caseNumber}</p><h1>{caseRecord.title}</h1><p className="subtitle">{caseRecord.type ?? "Case"} · Opened {courtDateFormatter.format(caseRecord.createdAt)}</p></div>
      <div className="case-workspace-badges"><span className={`pill pill-${courtFilingColor}`}>{courtFilingLabel}</span><span className={`pill ${caseRecord.archived ? "pill-muted" : `pill-${statusColor}`}`}>{caseRecord.archived ? "Archived" : caseRecord.stage ?? "No case status"}</span>{caseRecord.isDraft && <span className="pill pill-muted">Internal draft</span>}</div>
    </div>
    <dl className="case-workspace-facts">
      <div><dt>Assigned attorney</dt><dd>{caseRecord.assignedAttorney?.displayName ?? "Unassigned"}</dd></div>
      <div><dt>Assigned judge</dt><dd>{caseRecord.assignedJudge ?? "Not assigned"}</dd></div>
      <div><dt>Division</dt><dd>{caseRecord.division ?? "Not assigned"}</dd></div>
      <div><dt>Next deadline</dt><dd>{nextDeadline ? courtDateFormatter.format(nextDeadline.dueDate) : "None scheduled"}</dd></div>
    </dl>
    <div className="case-workspace-next"><div><strong>Next step</strong><p>{nextStep}</p></div><div className="case-workspace-actions">
      {!isCourtFiled && !pendingInitial && canFileCourt ? <CaseSectionLink href="#court-filing" className="govbtn">{returnedInitial ? "Resubmit complaint" : "File initial complaint"}</CaseSectionLink>
        : isCourtFiled && !caseRecord.assignedJudge && canEdit ? <CaseSectionLink href="#edit-case" className="govbtn">Assign judge</CaseSectionLink>
          : overdueCount || nextDeadline ? <CaseSectionLink href="#deadlines" className="govbtn">Review deadlines</CaseSectionLink>
            : isCourtFiled && canFileDocument ? <Link href={`/dashboard/filings/new?caseId=${caseRecord.id}`} className="govbtn">File a document</Link> : null}
      {canFileDocument && (!isCourtFiled || !caseRecord.assignedJudge || overdueCount > 0 || Boolean(nextDeadline)) && <Link href={`/dashboard/filings/new?caseId=${caseRecord.id}`} className="govbtn-outline">File a document</Link>}
      {canPropose && <CaseSectionLink href="#propose-edit" className="govbtn-outline">Propose an edit</CaseSectionLink>}
      <Link href="/dashboard/cases" className="govbtn-outline">My Cases</Link>
      {session.user.tiers.includes("developer_profile") && <Link href={`/dashboard/templates?caseId=${caseRecord.id}`} className="govbtn-outline">Create a DA document</Link>}
    </div></div>
  </header>;
  const caseOverview = <details className="case-detail-fold" id="overview" open>
    <summary><h2>People and case details</h2><span>{parties.length} parties</span></summary>
    <div className="case-detail-fold-body"><div className="case-overview-grid"><div><small>Submitting officer</small><strong>{caseRecord.createdBy.displayName}</strong></div><div><small>Access</small><strong>{accessLabel}</strong></div><div><small>Case type</small><strong>{caseRecord.type ?? "Not set"}</strong></div><div><small>Group</small><strong>{caseRecord.divisionGroup ?? "Not assigned"}</strong></div></div>
      {caseRecord.summary && <div className="case-overview-notes"><h3>Case notes</h3><p>{caseRecord.summary}</p></div>}
      <h3>People and parties</h3>{parties.length ? <ul className="case-parties">{parties.map((party, index) => <li key={`${party.name}-${index}`}><strong>{party.role}</strong><span>{party.name}</span></li>)}</ul> : <p className="note-inline">No people or parties have been listed.</p>}
    </div>
  </details>;
  const caseNavigation = <nav className="case-section-nav" aria-label="Case sections">
    <CaseSectionLink href="#court-filing">Court filing</CaseSectionLink><CaseSectionLink href="#overview">People</CaseSectionLink><CaseSectionLink href="#filings">Filings</CaseSectionLink><CaseSectionLink href="#deadlines">Deadlines</CaseSectionLink><CaseSectionLink href="#activity">History</CaseSectionLink><CaseSectionLink href="#related">Related</CaseSectionLink>{canEdit ? <CaseSectionLink href="#edit-case">Manage case</CaseSectionLink> : canPropose ? <CaseSectionLink href="#propose-edit">Propose edit</CaseSectionLink> : null}
  </nav>;

  if (!canEdit) {
    return (
      <div>
        <CaseFoldPersistence accountId={user.id} caseId={caseRecord.id} />
        {caseHeader}
        {caseNavigation}
        {courtFilingSection}
        {caseOverview}

        {filingsSection}
        {deadlinesSection}
        {activitySection}
        {relatedCasesSection}

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
      {courtFilingSection}
      {caseOverview}
      <details className="case-detail-fold" id="edit-case">
        <summary><h2>Manage case</h2><span>Assignment, status, and case dates</span></summary>
        <div className="case-detail-fold-body">
      <form action={updateCase} className="formbox case-edit-form">
        <div className="case-edit-heading"><div><p className="eyebrow">Case management</p><p className="lede">Update the case record, assignment, and key dates.</p></div><span className={`pill ${caseRecord.stage ? `pill-${statusColor}` : "pill-muted"}`}>{caseRecord.stage ?? "No status set"}</span></div>
        <input type="hidden" name="id" value={caseRecord.id} />
        <input type="hidden" name="summary" value={caseRecord.summary} />
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
          <summary>Dates and disclosures <span>Manual dates and automatic deadline triggers</span></summary>
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
        <h3>Trigger dates for automatic deadlines</h3>
        <p className="note-inline">Enter an event date when it occurs. Applicable deadlines are calculated from the master procedural rules. Calendar days are counted in Eastern Time.</p>
        <div className="field-row">
          <div className="field"><label htmlFor="arraignmentAt">Arraignment date</label><input type="date" id="arraignmentAt" name="arraignmentAt" defaultValue={toDateInputValue(caseRecord.arraignmentAt)} /></div>
          <div className="field"><label htmlFor="proofOfServiceAt">Proof of service date</label><input type="date" id="proofOfServiceAt" name="proofOfServiceAt" defaultValue={toDateInputValue(caseRecord.proofOfServiceAt)} /></div>
          <div className="field"><label htmlFor="discoveryOrderAt">Discovery order date</label><input type="date" id="discoveryOrderAt" name="discoveryOrderAt" defaultValue={toDateInputValue(caseRecord.discoveryOrderAt)} /></div>
          <div className="field"><label htmlFor="discoveryRequestedAt">Discovery request date</label><input type="date" id="discoveryRequestedAt" name="discoveryRequestedAt" defaultValue={toDateInputValue(caseRecord.discoveryRequestedAt)} /></div>
          <div className="field"><label htmlFor="motionServedAt">Written motion served</label><input type="date" id="motionServedAt" name="motionServedAt" defaultValue={toDateInputValue(caseRecord.motionServedAt)} /></div>
          <div className="field"><label htmlFor="verdictAt">Verdict date</label><input type="date" id="verdictAt" name="verdictAt" defaultValue={toDateInputValue(caseRecord.verdictAt)} /></div>
          <div className="field"><label htmlFor="sentenceAt">Sentence date</label><input type="date" id="sentenceAt" name="sentenceAt" defaultValue={toDateInputValue(caseRecord.sentenceAt)} /></div>
          <div className="field"><label htmlFor="finalJudgmentAt">Final judgment date</label><input type="date" id="finalJudgmentAt" name="finalJudgmentAt" defaultValue={toDateInputValue(caseRecord.finalJudgmentAt)} /></div>
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

      {filingsSection}
      {deadlinesSection}
      {activitySection}
      {relatedCasesSection}

      {canDelete && (
        <details className="case-detail-fold case-danger-zone" id="advanced-actions">
          <summary><h2>Advanced actions</h2><span>Permanent deletion</span></summary>
          <div className="case-detail-fold-body"><p className="note-inline">Deleting this case also deletes its filings, updates, and related requests. This cannot be undone.</p><RemoveButton id={caseRecord.id} action={deleteCase} label="Delete case" confirmMessage={`Permanently delete case ${caseRecord.caseNumber} and its filings, comments, and requests?`} className="govbtn case-delete-button" /></div>
        </details>
      )}
    </div>
  );
}

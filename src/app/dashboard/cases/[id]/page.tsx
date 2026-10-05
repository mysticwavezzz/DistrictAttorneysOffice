import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser, canAccessCase, canViewCases, canEditCase, canAssignCase, canReviewDivision } from "@/lib/case-access";
import { CASE_STATUSES, caseStatusColor } from "@/config/case-statuses";
import { updateCase, deleteCase, addFiling, deleteFiling, addComment } from "../actions";
import { submitCaseRequest } from "../requests/actions";
import { getSiteConfiguration } from "@/lib/site-settings";
import { RemoveButton } from "@/components/remove-button";
import { PdfUploadInput } from "@/components/pdf-upload-input";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getOngoingObligations, getProceduralDeadlines } from "@/lib/procedural-deadlines";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { shareMetadata } from "@/lib/share-metadata";
import { CaseFoldPersistence } from "@/components/case-fold-persistence";

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
    filings: { select: { id: true; title: true; url: true; pdfFileName: true; status: true; reviewNote: true; addedById: true; createdAt: true; addedBy: { select: { displayName: true } } } };
    comments: { include: { author: true } };
    relatedTo: true;
    relatedFrom: true;
  };
}>;

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

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
        filings: { select: { id: true, title: true, url: true, pdfFileName: true, status: true, reviewNote: true, addedById: true, createdAt: true, addedBy: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } },
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
        relatedTo: true,
        relatedFrom: true,
      },
    });
  } catch (error) {
    console.error("Failed to load case", error);
  }

  if (!caseRecord) notFound();
  const caseStatuses = await getSiteConfiguration("caseStatuses", CASE_STATUSES);
  if (!canAccessCase(session.user.tiers, user.id, caseRecord, user.division)) {
    redirect("/login?error=forbidden");
  }

  const canEdit = canEditCase(session.user.tiers, user.division, caseRecord.division);
  const canDelete = hasCapability(session.user.tiers, CAPABILITIES.CASES_DELETE);
  const canAssign = canAssignCase(session.user.tiers, user.division, caseRecord.division);
  const canPropose = !canEdit && hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT);
  const canReviewThisDivision = canReviewDivision(session.user.tiers, user.division, caseRecord.division);
  const visibleFilings = caseRecord.filings.filter((filing) => filing.status === "ACCEPTED" || filing.addedById === user.id || canReviewThisDivision);

  if (canEdit && canAssign) {
    try {
      attorneys = await prisma.user.findMany({
        select: { id: true, displayName: true },
        where: { ...(hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) ? {} : { division: user.division }) },
        orderBy: { displayName: "asc" },
      });
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
  const activeDeadlines = getProceduralDeadlines(caseRecord);
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
      {relatedCases.length === 0 ? <p className="note-inline">No related cases.</p> : <ul style={{ paddingLeft: 18, margin: 0 }}>
        {relatedCases.map((c) => (
          <li key={c.id} style={{ fontSize: 12.5 }}>
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
              <div className="case-filing-info"><strong>{f.title} <span className={`pill ${f.status === "ACCEPTED" ? "pill-green" : f.status === "PENDING" ? "pill-gold" : "pill-red"}`}>{f.status === "ACCEPTED" ? "Approved" : f.status === "PENDING" ? "Pending approval" : "Returned"}</span></strong><span>{f.pdfFileName ?? "Document"} · Submitted by {f.addedBy.displayName} · {dateTimeFormatter.format(f.createdAt)}</span>{f.reviewNote && f.status !== "ACCEPTED" && <span className="note-inline">Review note: {f.reviewNote}</span>}</div>
              <div className="case-filing-actions">
                {f.pdfFileName && <a href={`/api/cases/filings/${f.id}/pdf`} target="_blank" rel="noreferrer noopener" className="govbtn-outline">View PDF</a>}
                {f.url && <a href={f.url} target="_blank" rel="noreferrer noopener" className="govbtn-outline">Open link</a>}
                {((f.status === "PENDING" && f.addedById === user.id) || (f.status !== "PENDING" && canEdit)) && <RemoveButton id={f.id} action={deleteFiling} label={f.status === "PENDING" ? "Withdraw" : "Remove"} confirmMessage={`${f.status === "PENDING" ? "Withdraw" : "Remove"} the filing “${f.title}”?`} className="linklike" style={{ fontSize: 11 }} formStyle={{ display: "inline" }} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form action={addFiling} className="field-row case-inline-filing" style={{ marginBottom: 20 }} noValidate>
        <input type="hidden" name="caseId" value={caseRecord.id} />
        <input type="hidden" name="returnTo" value="case" />
        <div className="field" style={{ flex: "1 1 180px" }}>
          <label htmlFor="inline-filing-title">Document name</label><input id="inline-filing-title" type="text" name="title" placeholder="Filing title" maxLength={200} required />
        </div>
        <div className="field" style={{ flex: "1 1 220px" }}>
          <label htmlFor="inline-filing-pdf">PDF (max 5 MB)</label><PdfUploadInput id="inline-filing-pdf" name="pdf" required />
        </div>
        <PendingSubmitButton label="Attach PDF" pendingLabel="Uploading PDF…" className="govbtn-outline" />
      </form>
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
          <textarea name="body" rows={2} maxLength={4000} placeholder="Add a case update…" required />
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
          const overdue = deadline.dueDate.getTime() < new Date().setHours(0, 0, 0, 0);
          return <li key={deadline.key}><span className={overdue ? "deadline-overdue" : undefined}>{deadline.label}: {deadline.dueDate.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}{overdue ? " - OVERDUE" : ""}</span><small>{deadline.automatic ? `Calculated · ${deadline.authority}` : deadline.authority}</small></li>;
        })}{ongoingObligations.map((obligation) => <li key={obligation.key}><span>{obligation.label}</span><small>{obligation.authority} · Ongoing duty</small></li>)}</ul>}
      </div>
    </details>
  );

  if (!canEdit) {
    return (
      <div>
        <CaseFoldPersistence accountId={user.id} caseId={caseRecord.id} />
        <p className="eyebrow">{caseRecord.caseNumber}</p>
        <h1>{caseRecord.title}</h1>
        <p className="subtitle">
          {caseRecord.archived ? "Archived" : "Ongoing"} &middot;{" "}
          {caseRecord.stage ? <span className={`pill pill-${statusColor}`}>{caseRecord.stage}</span> : "No status set"}
          {caseRecord.isDraft && <span className="pill pill-muted" style={{ marginLeft: 6 }}>Draft</span>}
        </p>
        <div className="case-detail-actions"><Link href={`/dashboard/filings/new?caseId=${caseRecord.id}`} className="govbtn">File a Document</Link><Link href={`/dashboard/templates?caseId=${caseRecord.id}`} className="govbtn-outline">Create a DA document</Link><Link href="/dashboard/cases" className="govbtn-outline">My Cases</Link></div>
        <nav className="case-section-nav" aria-label="Case sections">
          <a href="#overview">Overview</a><a href="#filings">Filings</a><a href="#activity">Activity</a><a href="#deadlines">Deadlines</a>
        </nav>

        {deadlinesSection}

        <details className="case-detail-fold" id="overview" open>
          <summary><h2>Case overview</h2><span>{caseRecord.type ?? "Case details"}</span></summary>
          <div className="case-detail-fold-body formbox">
          <div className="cards" style={{ marginBottom: 16 }}>
            <div className="card">
              <span className="card-label">Assigned attorney</span>
              <span className="card-value" style={{ fontSize: 15 }}>
                {caseRecord.assignedAttorney?.displayName ?? "Unassigned"}
              </span>
            </div>
            <div className="card">
              <span className="card-label">Type</span>
              <span className="card-value" style={{ fontSize: 15 }}>
                {caseRecord.type ?? "Not set"}
              </span>
            </div>
          </div>
          <div className="case-detail-summary"><span><small>Assigned judge</small><strong>{caseRecord.assignedJudge ?? "Not assigned"}</strong></span><span><small>Submitting officer</small><strong>{caseRecord.createdBy.displayName}</strong></span><span><small>People / parties</small><strong>{parties.length}</strong></span></div>
          <h3>Summary</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{caseRecord.summary || "No summary has been added."}</p>
          <h3>People and parties</h3>
          {parties.length ? <ul className="case-parties">{parties.map((party, index) => <li key={`${party.name}-${index}`}><strong>{party.role}</strong><span>{party.name}</span></li>)}</ul> : <p className="note-inline">No people or parties have been listed.</p>}
          </div>
        </details>

        {relatedCasesSection}

        {filingsSection}
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
      <p className="eyebrow">{caseRecord.caseNumber}</p>
      <h1>{caseRecord.title}</h1>
        <p className="subtitle">Assigned to {caseRecord.assignedAttorney?.displayName ?? "Unassigned"} · {accessLabel}</p>
        <div className="case-detail-actions"><Link href={`/dashboard/filings/new?caseId=${caseRecord.id}`} className="govbtn">File a Document</Link><Link href={`/dashboard/templates?caseId=${caseRecord.id}`} className="govbtn-outline">Create a DA document</Link><Link href="/dashboard/cases" className="govbtn-outline">My Cases</Link></div>
        <ol className="status-timeline" aria-label="Case status timeline">
          <li><strong>Case opened</strong><time dateTime={caseRecord.createdAt.toISOString()}>{caseRecord.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</time></li>
          <li><strong>Current status: {caseRecord.stage ?? "Unassigned"}</strong><time dateTime={caseRecord.updatedAt.toISOString()}>Updated {caseRecord.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</time></li>
        </ol>
      <nav className="case-section-nav" aria-label="Case sections">
        <a href="#overview">Overview</a><a href="#filings">Filings</a><a href="#activity">Activity</a><a href="#deadlines">Deadlines</a>
      </nav>
      <details className="case-detail-fold" id="overview" open>
        <summary><h2>Case overview</h2><span>{parties.length} parties</span></summary>
        <div className="case-detail-fold-body formbox case-overview-people"><div className="case-detail-summary"><span><small>Assigned judge</small><strong>{caseRecord.assignedJudge ?? "Not assigned"}</strong></span><span><small>Submitting officer</small><strong>{caseRecord.createdBy.displayName}</strong></span><span><small>People / parties</small><strong>{parties.length}</strong></span></div><h3>People and parties</h3>{parties.length ? <ul className="case-parties">{parties.map((party, index) => <li key={`${party.name}-${index}`}><strong>{party.role}</strong><span>{party.name}</span></li>)}</ul> : <p className="note-inline">No people or parties have been listed.</p>}</div>
      </details>
      {deadlinesSection}

      <details className="case-detail-fold" id="edit-case">
        <summary><h2>Edit case</h2><span>Assignment, status, and case dates</span></summary>
        <div className="case-detail-fold-body">
      <form action={updateCase} className="formbox case-edit-form">
        <div className="case-edit-heading"><div><p className="eyebrow">Case management</p><h2>Edit case</h2><p className="lede">Update the case record, assignment, and key dates.</p></div><span className={`pill ${caseRecord.stage ? `pill-${statusColor}` : "pill-muted"}`}>{caseRecord.stage ?? "No status set"}</span></div>
        <input type="hidden" name="id" value={caseRecord.id} />
        <input type="hidden" name="summary" value={caseRecord.summary} />
        <fieldset className="case-edit-section">
          <legend>Case information</legend>
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
            <label htmlFor="type">Type</label>
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
            <label htmlFor="assignedAttorneyId">Assigned</label>
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

        <fieldset className="case-edit-section">
          <legend>Key dates and disclosures</legend>
        <div className="field">
          <label htmlFor="disclosures">Disclosures</label>
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
            <label htmlFor="discGiven">Disc. Given</label>
            <input type="date" id="discGiven" name="discGiven" defaultValue={toDateInputValue(caseRecord.discGiven)} />
          </div>
          <div className="field">
            <label htmlFor="discDue">Disc. Due</label>
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

        <fieldset className="case-edit-section">
          <legend>Outcome and related cases</legend>
        <div className="field">
          <label htmlFor="otherDates">Other Dates</label>
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
            <label htmlFor="appealBy">Appeal By</label>
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

        <div className="case-edit-actions"><Link href={`/dashboard/cases/${caseRecord.id}`} className="govbtn-outline">Cancel</Link><button type="submit" className="govbtn">Save Changes</button></div>
      </form>
        </div>
      </details>

      {relatedCasesSection}

      {filingsSection}
      {activitySection}

      {canDelete && (
        <RemoveButton id={caseRecord.id} action={deleteCase} label="Delete Case" confirmMessage={`Permanently delete case ${caseRecord.caseNumber} and its filings, comments, and requests?`} className="govbtn" style={{ background: "var(--down)", borderColor: "#6b2018" }} formStyle={{ marginTop: 16 }} />
      )}
    </div>
  );
}

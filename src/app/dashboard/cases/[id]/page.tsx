import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser, canAccessCase } from "@/lib/case-access";
import { CASE_STATUSES, caseStatusColor } from "@/config/case-statuses";
import { updateCase, deleteCase, addFiling, deleteFiling, addComment } from "../actions";
import { submitCaseRequest } from "../requests/actions";
import { getSiteConfiguration } from "@/lib/site-settings";
import { RemoveButton } from "@/components/remove-button";

type CaseWithRelations = Prisma.CaseGetPayload<{
  include: {
    assignedAttorney: true;
    createdBy: true;
    filings: { include: { addedBy: true } };
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
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) {
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
        filings: { include: { addedBy: true }, orderBy: { createdAt: "desc" } },
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
  if (!canAccessCase(session.user.tiers, user.id, caseRecord)) {
    redirect("/login?error=forbidden");
  }

  const canEdit = hasCapability(session.user.tiers, CAPABILITIES.CASES_EDIT);
  const canDelete = hasCapability(session.user.tiers, CAPABILITIES.CASES_DELETE);
  const canAssign = hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN);
  const canPropose = !canEdit && hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT);

  if (canEdit && canAssign) {
    try {
      attorneys = await prisma.user.findMany({
        select: { id: true, displayName: true },
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
    : canEdit ? "Edit access" : canPropose ? "Read and propose edits" : "Read access";
  const deadlines = [
    ["Discovery due", caseRecord.discDue],
    ["Pretrial", caseRecord.pretrial],
    ["Appeal deadline", caseRecord.appealBy],
  ] as const;
  const activeDeadlines = deadlines.filter(([, date]) => date);

  const relatedCasesSection = (
    <section className="formbox" id="related">
      <h3 style={{ marginTop: 0 }}>Related Cases</h3>
      {relatedCases.length === 0 ? <p className="note-inline">No related cases.</p> : <ul style={{ paddingLeft: 18, margin: 0 }}>
        {relatedCases.map((c) => (
          <li key={c.id} style={{ fontSize: 12.5 }}>
            <Link href={`/dashboard/cases/${c.id}`}>
              {c.caseNumber} &mdash; {c.title}
            </Link>
          </li>
        ))}
      </ul>}
    </section>
  );

  const filingsAndComments = (
    <>
      <h3 id="filings">Filings</h3>
      {caseRecord.filings.length === 0 ? (
        <p className="note-inline">No filings attached.</p>
      ) : (
        <ul style={{ paddingLeft: 18, marginBottom: 10 }}>
          {caseRecord.filings.map((f) => (
            <li key={f.id} style={{ marginBottom: 4, fontSize: 12.5 }}>
              <a href={f.url} target="_blank" rel="noreferrer noopener">
                {f.title}
              </a>{" "}
              <span className="note-inline">
                &mdash; added by {f.addedBy.displayName}, {dateTimeFormatter.format(f.createdAt)}
              </span>{" "}
              <RemoveButton id={f.id} action={deleteFiling} label="Remove" confirmMessage={`Remove the filing “${f.title}”?`} className="linklike" style={{ fontSize: 11 }} formStyle={{ display: "inline" }} />
            </li>
          ))}
        </ul>
      )}
      <form action={addFiling} className="field-row" style={{ marginBottom: 20 }}>
        <input type="hidden" name="caseId" value={caseRecord.id} />
        <div className="field" style={{ flex: "1 1 180px" }}>
          <input type="text" name="title" placeholder="Filing title" maxLength={200} required />
        </div>
        <div className="field" style={{ flex: "1 1 220px" }}>
          <input type="text" name="url" placeholder="https://…" maxLength={2000} required />
        </div>
        <button type="submit" className="govbtn-outline">
          Attach
        </button>
      </form>

      <h3 id="activity">Activity</h3>
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
    </>
  );

  if (!canEdit) {
    return (
      <div>
        <p className="eyebrow">{caseRecord.caseNumber}</p>
        <h1>{caseRecord.title}</h1>
        <p className="subtitle">
          {caseRecord.archived ? "Archived" : "Ongoing"} &middot;{" "}
          {caseRecord.stage ? <span className={`pill pill-${statusColor}`}>{caseRecord.stage}</span> : "No status set"}
          {caseRecord.isDraft && <span className="pill pill-muted" style={{ marginLeft: 6 }}>Draft</span>}
        </p>
        <nav className="case-section-nav" aria-label="Case sections">
          <a href="#overview">Overview</a><a href="#filings">Filings</a><a href="#activity">Activity</a><a href="#deadlines">Deadlines</a><a href="#related">Related Cases</a>
        </nav>

        <section id="deadlines" className="deadline-summary" aria-label="Case deadlines">
          <h2>Deadlines</h2>
          {activeDeadlines.length === 0 ? <p>No deadlines recorded.</p> : <ul>{activeDeadlines.map(([label, date]) => {
            const overdue = date!.getTime() < new Date().setHours(0, 0, 0, 0);
            return <li key={label}><span className={overdue ? "deadline-overdue" : undefined}>{label}: {date!.toLocaleDateString("en-US", { dateStyle: "medium" })}{overdue ? " - OVERDUE" : ""}</span></li>;
          })}</ul>}
        </section>

        <div className="formbox">
          <div className="cards" style={{ marginBottom: 16 }}>
            <div className="card">
              <span className="card-label">Assigned</span>
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
          <h3 id="overview">Summary</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{caseRecord.summary}</p>
        </div>

        {relatedCasesSection}

        <div className="formbox">{filingsAndComments}</div>

        {canPropose && (
          <div className="formbox">
            <h2 style={{ marginTop: 0 }}>Propose an Edit</h2>
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
              <div className="field">
                <label htmlFor="p-summary">Summary</label>
                <textarea
                  id="p-summary"
                  name="summary"
                  rows={4}
                  maxLength={4000}
                  defaultValue={caseRecord.summary}
                />
              </div>
              <input type="hidden" name="disclosures" value={caseRecord.disclosures ?? ""} />
              <input type="hidden" name="discGiven" value={toDateInputValue(caseRecord.discGiven)} />
              <input type="hidden" name="discDue" value={toDateInputValue(caseRecord.discDue)} />
              <input type="hidden" name="pretrial" value={toDateInputValue(caseRecord.pretrial)} />
              <input type="hidden" name="otherDates" value={caseRecord.otherDates ?? ""} />
              <input type="hidden" name="outcome" value={caseRecord.outcome ?? ""} />
              <input type="hidden" name="closedOn" value={toDateInputValue(caseRecord.closedOn)} />
              <input type="hidden" name="appealBy" value={toDateInputValue(caseRecord.appealBy)} />
              <button type="submit" className="govbtn">
                Submit for Review
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">{caseRecord.caseNumber}</p>
      <h1>{caseRecord.title}</h1>
        <p className="subtitle">Assigned to {caseRecord.assignedAttorney?.displayName ?? "Unassigned"} · {accessLabel}</p>
        <ol className="status-timeline" aria-label="Case status timeline">
          <li><strong>Case opened</strong><time dateTime={caseRecord.createdAt.toISOString()}>{caseRecord.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</time></li>
          <li><strong>Current status: {caseRecord.stage ?? "Unassigned"}</strong><time dateTime={caseRecord.updatedAt.toISOString()}>Updated {caseRecord.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</time></li>
        </ol>
      <nav className="case-section-nav" aria-label="Case sections">
        <a href="#overview">Overview</a><a href="#filings">Filings</a><a href="#activity">Activity</a><a href="#deadlines">Deadlines</a><a href="#related">Related Cases</a>
      </nav>
      <section id="deadlines" className="deadline-summary" aria-label="Case deadlines">
        <h2>Deadlines</h2>
        {activeDeadlines.length === 0 ? <p>No deadlines recorded.</p> : <ul>{activeDeadlines.map(([label, date]) => {
          const overdue = date!.getTime() < new Date().setHours(0, 0, 0, 0);
          return <li key={label}><span className={overdue ? "deadline-overdue" : undefined}>{label}: {date!.toLocaleDateString("en-US", { dateStyle: "medium" })}{overdue ? " - OVERDUE" : ""}</span></li>;
        })}</ul>}
      </section>

      <form action={updateCase} className="formbox" id="overview">
        <input type="hidden" name="id" value={caseRecord.id} />

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
        </div>

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
          <label htmlFor="summary">Summary</label>
          <textarea id="summary" name="summary" rows={4} maxLength={4000} defaultValue={caseRecord.summary} />
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

        <button type="submit" className="govbtn">
          Save Changes
        </button>
      </form>

      {relatedCasesSection}

      <div className="formbox">{filingsAndComments}</div>

      {canDelete && (
        <RemoveButton id={caseRecord.id} action={deleteCase} label="Delete Case" confirmMessage={`Permanently delete case ${caseRecord.caseNumber} and its filings, comments, and requests?`} className="govbtn" style={{ background: "var(--down)", borderColor: "#6b2018" }} formStyle={{ marginTop: 16 }} />
      )}
    </div>
  );
}

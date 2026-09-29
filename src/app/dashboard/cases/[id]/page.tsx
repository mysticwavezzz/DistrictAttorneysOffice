import { redirect, notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser, canAccessCase } from "@/lib/case-access";
import { CASE_STATUSES, caseStatusColor } from "@/config/case-statuses";
import { updateCase, deleteCase, addFiling, deleteFiling, addComment } from "../actions";
import { submitCaseRequest } from "../requests/actions";

type CaseWithRelations = Prisma.CaseGetPayload<{
  include: {
    assignedAttorney: true;
    createdBy: true;
    filings: { include: { addedBy: true } };
    comments: { include: { author: true } };
  };
}>;

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const user = await localUser(session.user.discordUserId);
  if (!user) redirect("/login?error=forbidden");

  let caseRecord: CaseWithRelations | null = null;
  let attorneys: { id: string; displayName: string }[] = [];
  try {
    caseRecord = await prisma.case.findUnique({
      where: { id: params.id },
      include: {
        assignedAttorney: true,
        createdBy: true,
        filings: { include: { addedBy: true }, orderBy: { createdAt: "desc" } },
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      },
    });
  } catch (error) {
    console.error("Failed to load case", error);
  }

  if (!caseRecord) notFound();
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

  const filingsAndComments = (
    <>
      <h3>Filings</h3>
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
              <form action={deleteFiling} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={f.id} />
                <button type="submit" className="linklike" style={{ fontSize: 11 }}>
                  remove
                </button>
              </form>
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
        <button type="submit" className="govbtn-outline" style={{ color: "var(--link)", border: "1px solid var(--bd)" }}>
          Attach
        </button>
      </form>

      <h3>Case Log</h3>
      <div className="comment-log">
        {caseRecord.comments.length === 0 ? (
          <div className="comment-item">No updates yet.</div>
        ) : (
          caseRecord.comments.map((c) => (
            <div key={c.id} className={`comment-item${c.isSystem ? " system" : ""}`}>
              {!c.isSystem && (
                <div className="comment-meta">
                  {c.author?.displayName ?? "Unknown"} &middot; {dateTimeFormatter.format(c.createdAt)}
                </div>
              )}
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
        <button type="submit" className="govbtn-outline" style={{ color: "var(--link)", border: "1px solid var(--bd)" }}>
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
        </p>

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
                {caseRecord.type ?? "—"}
              </span>
            </div>
          </div>
          <h3>Summary</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{caseRecord.summary}</p>
        </div>

        <div className="formbox">{filingsAndComments}</div>

        {canPropose && (
          <div className="formbox">
            <h2 style={{ marginTop: 0 }}>Propose an Edit</h2>
            <p className="note-inline">Submitted for review by a Supervising ADA before it takes effect.</p>
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
                    {CASE_STATUSES.map((s) => (
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

      <form action={updateCase} className="formbox">
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
              {CASE_STATUSES.map((s) => (
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
          <label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}>
            <input type="checkbox" name="archived" defaultChecked={caseRecord.archived} />
            Archived
          </label>
        </div>

        <button type="submit" className="govbtn">
          Save Changes
        </button>
      </form>

      <div className="formbox">{filingsAndComments}</div>

      {canDelete && (
        <form action={deleteCase} style={{ marginTop: 16 }}>
          <input type="hidden" name="id" value={caseRecord.id} />
          <button type="submit" className="govbtn" style={{ background: "var(--down)", borderColor: "#6b2018" }}>
            Delete Case
          </button>
        </form>
      )}
    </div>
  );
}

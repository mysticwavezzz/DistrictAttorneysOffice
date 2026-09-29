import { redirect, notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { updateCase, deleteCase } from "../actions";

type CaseWithRelations = Prisma.CaseGetPayload<{
  include: { assignedAttorney: true; createdBy: true };
}>;

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const canEdit = hasCapability(session.user.tiers, CAPABILITIES.CASES_EDIT);
  const canDelete = hasCapability(session.user.tiers, CAPABILITIES.CASES_DELETE);

  let caseRecord: CaseWithRelations | null = null;
  let attorneys: { id: string; displayName: string }[] = [];
  try {
    caseRecord = await prisma.case.findUnique({
      where: { id: params.id },
      include: { assignedAttorney: true, createdBy: true },
    });
    if (canEdit) {
      attorneys = await prisma.user.findMany({
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
      });
    }
  } catch (error) {
    console.error("Failed to load case", error);
  }

  if (!caseRecord) notFound();

  if (!canEdit) {
    return (
      <div>
        <p className="eyebrow">{caseRecord.caseNumber}</p>
        <h1>{caseRecord.title}</h1>
        <p className="subtitle">
          {caseRecord.archived ? "Archived" : "Ongoing"} · {caseRecord.stage ?? "No stage set"}
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
            <label htmlFor="stage">Stage</label>
            <input type="text" id="stage" name="stage" maxLength={100} defaultValue={caseRecord.stage ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="assignedAttorneyId">Assigned</label>
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

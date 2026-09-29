import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { CASE_STATUSES } from "@/config/case-statuses";
import { createCase } from "../actions";
import { submitCaseRequest } from "../requests/actions";

export default async function NewCasePage() {
  const session = await auth();
  const canCreate = session?.user && hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE);
  const canPropose = session?.user && hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT);
  if (!session?.user || (!canCreate && !canPropose)) {
    redirect("/login?error=forbidden");
  }

  const canAssign = hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN);
  let attorneys: { id: string; displayName: string }[] = [];
  if (canAssign) {
    try {
      attorneys = await prisma.user.findMany({
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
      });
    } catch (error) {
      console.error("Failed to load attorneys", error);
    }
  }

  const action = canCreate ? createCase : submitCaseRequest;

  return (
    <div>
      <h1>{canCreate ? "New Case" : "Propose New Case"}</h1>
      {!canCreate && (
        <p className="note-inline">
          This will be submitted for review by a Supervising ADA before it appears on the docket.
        </p>
      )}

      <form action={action} className="formbox">
        <div className="field-row">
          <div className="field" style={{ flex: "1 1 260px" }}>
            <label htmlFor="title">Case Title</label>
            <input type="text" id="title" name="title" required maxLength={200} />
          </div>
          <div className="field" style={{ flex: "1 1 180px" }}>
            <label htmlFor="caseNumber">Case #</label>
            <input type="text" id="caseNumber" name="caseNumber" required maxLength={50} />
          </div>
        </div>

        <div className="field-row">
          <div className="field" style={{ flex: "1 1 180px" }}>
            <label htmlFor="type">Type</label>
            <input type="text" id="type" name="type" maxLength={100} placeholder="Felony, Misdemeanor, …" />
          </div>
          <div className="field" style={{ flex: "1 1 180px" }}>
            <label htmlFor="stage">Status</label>
            <select id="stage" name="stage" defaultValue="">
              <option value="">No status set</option>
              {CASE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {canAssign && (
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label htmlFor="assignedAttorneyId">Assigned</label>
              <select id="assignedAttorneyId" name="assignedAttorneyId">
                <option value="">Unassigned</option>
                {attorneys.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="disclosures">Disclosures</label>
          <input type="text" id="disclosures" name="disclosures" maxLength={2000} />
        </div>

        <div className="field-row">
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="discGiven">Disc. Given</label>
            <input type="date" id="discGiven" name="discGiven" />
          </div>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="discDue">Disc. Due</label>
            <input type="date" id="discDue" name="discDue" />
          </div>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="pretrial">Pretrial</label>
            <input type="date" id="pretrial" name="pretrial" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="otherDates">Other Dates</label>
          <input type="text" id="otherDates" name="otherDates" maxLength={500} />
        </div>

        <div className="field">
          <label htmlFor="outcome">Outcome</label>
          <input type="text" id="outcome" name="outcome" maxLength={500} />
        </div>

        <div className="field-row">
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="closedOn">Closed On</label>
            <input type="date" id="closedOn" name="closedOn" />
          </div>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="appealBy">Appeal By</label>
            <input type="date" id="appealBy" name="appealBy" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="summary">Summary</label>
          <textarea id="summary" name="summary" rows={4} maxLength={4000} />
        </div>

        <button type="submit" className="govbtn">
          {canCreate ? "Create Case" : "Submit for Review"}
        </button>
      </form>
    </div>
  );
}

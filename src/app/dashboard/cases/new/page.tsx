import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { createCase } from "../actions";

export default async function NewCasePage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE)) {
    redirect("/login?error=forbidden");
  }

  let attorneys: { id: string; displayName: string }[] = [];
  try {
    attorneys = await prisma.user.findMany({
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    });
  } catch (error) {
    console.error("Failed to load attorneys", error);
  }

  return (
    <div>
      <h1>New Case</h1>

      <form action={createCase} className="formbox">
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
            <label htmlFor="stage">Stage</label>
            <input type="text" id="stage" name="stage" maxLength={100} placeholder="Awaiting Filing, Discovery, …" />
          </div>
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
          Create Case
        </button>
      </form>
    </div>
  );
}

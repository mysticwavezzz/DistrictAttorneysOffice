import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";
import { submitAopc } from "./actions";
import { getSiteConfiguration } from "@/lib/site-settings";
import Link from "next/link";
import { UNITS } from "@/config/units";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function AffidavitsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const session = await auth();
  const canSubmit = session?.user && hasCapability(session.user.tiers, CAPABILITIES.AOPC_SUBMIT);
  const canReview = session?.user && hasCapability(session.user.tiers, CAPABILITIES.AOPC_REVIEW);
  if (!session?.user || (!canSubmit && !canReview)) redirect("/login?error=forbidden");

  const user = await localUser(session.user.discordUserId);
  const divisions = await getSiteConfiguration("divisions", UNITS);
  const targetUnits = divisions.filter((unit) => unit.acceptsAopc).map((unit) => unit.value);
  const aopcs = await prisma.aopc.findMany({
    where: canReview ? {} : { submittedById: user?.id },
    orderBy: { createdAt: "desc" },
    include: { submittedBy: true, reviewedBy: true, linkedCase: true },
    take: 50,
  });
  const pending = aopcs.filter((aopc) => aopc.status === "PENDING");
  const decided = aopcs.filter((aopc) => aopc.status !== "PENDING");

  function renderRow(aopc: (typeof aopcs)[number]) {
    const reportId = aopc.reportId ?? aopc.id;
    return (
      <Link className="aopc-row" href={`/dashboard/affidavits/${aopc.id}`} key={aopc.id}>
        <span className="aopc-row-id">{reportId}</span>
        <span className="aopc-row-unit">{aopc.targetUnit}</span>
        <span className="aopc-row-meta">{aopc.submittedBy.displayName} · {dateFormatter.format(aopc.createdAt)}</span>
        <span className={`pill ${aopc.status === "PENDING" ? "pill-gold" : aopc.status === "ACCEPTED" ? "pill-green" : "pill-red"}`}>{aopc.status}</span>
        <span className="aopc-row-open" aria-hidden="true">View →</span>
      </Link>
    );
  }

  return (
    <div className="aopc-page">
      <h1>Affidavits of Probable Cause</h1>
      <p className="lede">Submit and review AOPCs referred to an authorized division.</p>
      {params.error === "report-id-in-use" && <p className="message" role="alert">That report ID is already in use. Check it and try again.</p>}

      {canReview && (
        <details className="aopc-section" open>
          <summary>Pending ({pending.length})</summary>
          <div className="aopc-list">
            {pending.length ? pending.map(renderRow) : <p className="message">Nothing waiting on review.</p>}
          </div>
        </details>
      )}

      <details className="aopc-section">
        <summary>{canReview ? "Recently Reviewed" : "Your Past Submissions"} ({decided.length})</summary>
        <div className="aopc-list">
          {decided.length ? decided.slice(0, 15).map(renderRow) : <p className="message">Nothing here yet.</p>}
        </div>
      </details>

      {canSubmit && (
        <details className="aopc-section" id="submit-aopc">
          <summary>Submit a New Affidavit of Probable Cause</summary>
          <form action={submitAopc} className="formbox aopc-submit-form">
            <div className="field">
              <label htmlFor="reportId">Report ID</label>
              <input type="text" id="reportId" name="reportId" required maxLength={100} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="targetUnit">Send To</label>
                <select id="targetUnit" name="targetUnit" defaultValue={targetUnits[0]}>
                  {targetUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="submittingOfficer">Submitting Officer</label>
                <input id="submittingOfficer" value={session.user.displayName} readOnly aria-describedby="officer-hint" />
                <span className="hint" id="officer-hint">Filled from your signed-in staff account.</span>
              </div>
            </div>
            <fieldset className="field aopc-document-field">
              <legend>AOPC document <span className="hint">(provide a link or upload one PDF)</span></legend>
              <div className="field"><label htmlFor="documentUrl">Link to the AOPC</label><input type="url" id="documentUrl" name="documentUrl" maxLength={2000} placeholder="https://…" /></div>
              <p className="note-inline" aria-hidden="true">Or</p>
              <div className="field"><label htmlFor="aopcPdf">Upload AOPC as PDF (max 5 MB)</label><input type="file" id="aopcPdf" name="pdf" accept="application/pdf,.pdf" /></div>
            </fieldset>
            <button type="submit" className="govbtn">Submit AOPC</button>
          </form>
        </details>
      )}
    </div>
  );
}

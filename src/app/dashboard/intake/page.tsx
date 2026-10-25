import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { caseVisibilityWhere, localUser } from "@/lib/case-access";
import { AOPC_TARGET_UNITS } from "@/config/units";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { submitIntakeReport } from "./actions";

export const metadata = staffPageMetadata("Case Intake", "Open a case or submit an AOPC and investigative report with supporting records.", "/dashboard/intake");
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

export default async function IntakePage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const session = await auth();
  if (!session?.user || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT))) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const visibility = caseVisibilityWhere(session.user.tiers, user.id, user.division, user.divisionGroup);
  const [cases, reports, params] = await Promise.all([
    prisma.case.findMany({ where: { archived: false, ...(visibility ? { AND: [visibility] } : {}) }, select: { id: true, caseNumber: true, title: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
    prisma.aopc.findMany({ where: { submittedById: user.id }, select: { id: true, title: true, reportId: true, status: true, targetUnit: true, createdAt: true, linkedCase: { select: { id: true, caseNumber: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    searchParams,
  ]);
  const canOpenCase = hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) || hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT);

  return <div className="intake-page">
    <p className="eyebrow">Casework · Intake and Review</p><h1>Case intake</h1>
    <p className="lede">Start a case submission or send an AOPC and investigative report to the Review Inbox. Portal approval and court filing remain separate steps.</p>
    {params.submitted === "1" && <p className="message message-success" role="status">Report submitted for review. It has not been filed with the court.</p>}
    <div className="intake-grid">
      <section className="workbench-panel"><span className="pill pill-navy">Case opening</span><h2>Open or propose a case</h2><p>Enter the charging document and case details in the existing case-opening workflow. Add an attorney only if you have assignment authority.</p><ol className="intake-checklist"><li>Confirm the case number and party names.</li><li>Attach the initial complaint or charging document.</li><li>Review the proposed attorney assignment.</li><li>Submit for approval when required.</li></ol>{canOpenCase && <Link className="govbtn" href="/dashboard/cases/new">Start case opening</Link>}</section>
      <section className="workbench-panel"><span className="pill pill-gold">AOPC / report</span><h2>Submit a supporting report</h2><p>The report enters review as pending. Attach the PDF or add a source link, and link a case when one is already open.</p>
        <form action={submitIntakeReport} className="workbench-form" encType="multipart/form-data">
          <div className="field"><label htmlFor="intake-title">Document title</label><input id="intake-title" name="title" required maxLength={180} placeholder="Investigative Report"/></div>
          <div className="field"><label htmlFor="intake-report-id">Report / AOPC number</label><input id="intake-report-id" name="reportId" maxLength={100}/></div>
          <div className="field"><label htmlFor="intake-unit">Reviewing division</label><select id="intake-unit" name="targetUnit" required>{AOPC_TARGET_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></div>
          <div className="field"><label htmlFor="intake-subject">Subject / involved person</label><input id="intake-subject" name="subject" required maxLength={180}/></div>
          <div className="field field-wide"><label htmlFor="intake-case">Link to an existing case <span className="hint">Optional</span></label><select id="intake-case" name="linkedCaseId" defaultValue=""><option value="">Not linked yet</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.caseNumber} · {item.title}</option>)}</select></div>
          <div className="field field-wide"><label htmlFor="intake-narrative">Report summary</label><textarea id="intake-narrative" name="narrative" rows={7} minLength={20} maxLength={20000} required placeholder="Describe the report and what records are attached."/></div>
          <div className="field field-wide"><label htmlFor="intake-pdf">Supporting PDF <span className="hint">5 MB maximum</span></label><input id="intake-pdf" name="pdf" type="file" accept="application/pdf,.pdf"/></div>
          <div className="field field-wide"><label htmlFor="intake-url">Or source link</label><input id="intake-url" name="documentUrl" type="url" maxLength={2000} placeholder="https://"/></div>
          <button className="govbtn" type="submit">Submit report for review</button>
        </form>
      </section>
    </div>
    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Your submissions</p><h2>AOPCs and reports</h2></div><Link href="/dashboard/review?type=aopc">Open Review Inbox ↗</Link></div>
      {reports.length ? <ul className="search-results">{reports.map((item) => <li key={item.id}><strong>{item.reportId ?? item.title}</strong><span>{item.targetUnit} · {item.status} · {dateFormat.format(item.createdAt)}{item.linkedCase ? ` · ${item.linkedCase.caseNumber}` : " · Not linked to a case"}</span></li>)}</ul> : <p className="note-inline">No AOPCs or reports submitted by this account yet.</p>}
    </section>
  </div>;
}

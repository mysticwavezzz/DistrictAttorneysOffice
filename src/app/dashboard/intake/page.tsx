import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";
import { staffPageMetadata } from "@/lib/staff-metadata";

export const metadata = staffPageMetadata("Case Intake", "Open or propose a case and review your prior supporting-document submissions.", "/dashboard/intake");
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

export default async function IntakePage() {
  const session = await auth();
  if (!session?.user || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT))) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const reports = await prisma.aopc.findMany({ where: { submittedById: user.id }, select: { id: true, title: true, documentType: true, reportId: true, status: true, targetUnit: true, createdAt: true, linkedCase: { select: { id: true, caseNumber: true } } }, orderBy: { createdAt: "desc" }, take: 20 });
  const canOpenCase = hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) || hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT);

  return <div className="intake-page">
    <p className="eyebrow">Casework · Intake and Review</p><h1>Case intake</h1>
    <p className="lede">Open or propose a case, then review your earlier supporting-document submissions below.</p>
    <section className="workbench-panel"><span className="pill pill-navy">Case opening</span><h2>Open or propose a case</h2><p>Enter the charging document and case details in the existing case-opening workflow. Add an attorney only if you have assignment authority.</p><ol className="intake-checklist"><li>Confirm the case number and party names.</li><li>Attach the initial complaint or charging document.</li><li>Review the proposed attorney assignment.</li><li>Submit for approval when required.</li></ol>{canOpenCase && <Link className="govbtn" href="/dashboard/cases/new">Start case opening</Link>}</section>
    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Your submissions</p><h2>AOPCs and reports</h2></div><Link href="/dashboard/review?type=aopc">Open Review Inbox ↗</Link></div>
      {reports.length ? <ul className="search-results">{reports.map((item) => <li key={item.id}><strong>{item.reportId ?? item.title}</strong><span>{item.documentType === "AOPC" ? "AOPC" : "Investigative Report"} · {item.targetUnit} · {item.status} · {dateFormat.format(item.createdAt)}{item.linkedCase ? ` · ${item.linkedCase.caseNumber}` : " · Not linked to a case"}</span></li>)}</ul> : <p className="note-inline">No AOPCs or reports submitted by this account yet.</p>}
    </section>
  </div>;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireInvestigator } from "@/lib/investigator-intake";
import { prisma } from "@/lib/prisma";
import { createInvestigatorTicket } from "./actions";

export const metadata = { title: "Investigator Intake | Harrison County DAO", robots: { index: false, follow: false } };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

export default async function InvestigatorIntakePage() {
  const access = await requireInvestigator();
  if (!access) redirect("/login?error=forbidden");
  const tickets = await prisma.contactTicket.findMany({
    where: { category: "INVESTIGATOR_INTAKE", requesterId: access.user.id },
    include: { aopcs: { select: { id: true, status: true, documentType: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 }, assignee: { select: { displayName: true } } },
    orderBy: { updatedAt: "desc" }, take: 50,
  });
  return <main className="investigator-shell">
    <header className="investigator-header"><Link href="/" className="investigator-brand">Harrison County · District Attorney&apos;s Office</Link><span>Investigator Intake</span></header>
    <section className="investigator-welcome"><p className="eyebrow">Criminal Division</p><h1>Submit an AOPC or investigative report</h1><p>Documents go to a Criminal Division reviewer as a private ticket. You can follow up, add supporting documents, and see the review status here.</p></section>
    <div className="investigator-grid">
      <section className="investigator-panel"><h2>New intake</h2><p className="note-inline">Choose the document type. An investigative report is supporting material; after it is approved, an attorney must prepare and attach a separate AOPC before opening the case.</p>
        <form action={createInvestigatorTicket} className="workbench-form" encType="multipart/form-data">
          <div className="field"><label htmlFor="inv-document-type">Document type</label><select id="inv-document-type" name="documentType" required defaultValue="INVESTIGATIVE_REPORT"><option value="AOPC">Affidavit of Probable Cause (AOPC)</option><option value="INVESTIGATIVE_REPORT">Investigative Report</option></select></div>
          <div className="field"><label htmlFor="inv-title">Document title</label><input id="inv-title" name="title" required maxLength={180} placeholder="Document title"/></div>
          <div className="field"><label htmlFor="inv-report-id">AOPC / report number</label><input id="inv-report-id" name="reportId" maxLength={100}/></div>
          <div className="field"><label htmlFor="inv-subject">Subject / involved person</label><input id="inv-subject" name="subject" required maxLength={180}/></div>
          <div className="field field-wide"><label htmlFor="inv-narrative">Summary and relevant facts</label><textarea id="inv-narrative" name="narrative" rows={7} minLength={20} maxLength={20000} required placeholder="Summarize the investigation and identify what the attached report contains."/></div>
          <div className="field field-wide"><label htmlFor="inv-pdf">Attach PDF</label><input id="inv-pdf" name="pdf" type="file" accept="application/pdf,.pdf"/><small>AOPCs require a PDF. Investigative reports may use a PDF or source link. Maximum 5 MB.</small></div>
          <div className="field field-wide"><label htmlFor="inv-url">Source link</label><input id="inv-url" name="documentUrl" type="url" maxLength={2000} placeholder="https://"/></div>
          <button className="govbtn" type="submit">Submit to Criminal Division</button>
        </form>
      </section>
      <section className="investigator-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Your submissions</p><h2>Intake tickets</h2></div><span className="pill pill-navy">{tickets.length}</span></div>
        {!tickets.length ? <p className="note-inline">No documents submitted yet.</p> : <div className="investigator-ticket-list">{tickets.map((ticket) => {
          const latest = ticket.messages[0];
          return <Link className="investigator-ticket" href={`/investigator/intake/tickets/${ticket.id}`} key={ticket.id}>
            <span className="investigator-ticket-top"><strong>{ticket.subject}</strong><span className={`pill ${ticket.intakeStatus === "APPROVED" ? "pill-green" : ticket.intakeStatus === "NEEDS_INFO" ? "pill-gold" : ticket.intakeStatus === "DENIED" ? "pill-red" : "pill-muted"}`}>{(ticket.intakeStatus ?? ticket.status).replaceAll("_", " ")}</span></span>
            <span>{ticket.aopcs.length} document{ticket.aopcs.length === 1 ? "" : "s"} · {ticket.aopcs.some((doc) => doc.status === "ACCEPTED" && doc.documentType === "INVESTIGATIVE_REPORT") && !ticket.aopcs.some((doc) => doc.status === "ACCEPTED" && doc.documentType === "AOPC") ? "AOPC required before case opening · " : ""}{ticket.assignee?.displayName ? `Reviewer: ${ticket.assignee.displayName}` : "Waiting for reviewer assignment"}</span>
            <span>{latest?.body.slice(0, 150) ?? "No messages"}</span><time>{dateFormat.format(ticket.updatedAt)}</time>
          </Link>;
        })}</div>}
      </section>
    </div>
    <footer className="investigator-footer"><Link href="/">Harrison County home</Link><span>Investigator access is limited to this intake and its own tickets.</span></footer>
  </main>;
}

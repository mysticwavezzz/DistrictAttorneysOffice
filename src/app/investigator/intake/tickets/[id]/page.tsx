import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireInvestigator } from "@/lib/investigator-intake";
import { prisma } from "@/lib/prisma";
import { addSupplementalReport, investigatorReply } from "../../actions";

export const metadata = { title: "Investigator Intake Ticket | Harrison County DAO", robots: { index: false, follow: false } };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

export default async function InvestigatorTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const access = await requireInvestigator();
  if (!access) redirect("/login?error=forbidden");
  const { id } = await params;
  const query = await searchParams;
  const ticket = await prisma.contactTicket.findFirst({ where: { id, category: "INVESTIGATOR_INTAKE", requesterId: access.user.id }, include: {
    assignee: { select: { displayName: true } },
    messages: { include: { author: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } },
    aopcs: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, documentType: true, reportId: true, subject: true, narrative: true, pdfFileName: true, documentUrl: true, status: true, reviewNote: true, createdAt: true } },
  } });
  if (!ticket) notFound();
  return <main className="investigator-shell">
    <header className="investigator-header"><Link href="/" className="investigator-brand">Harrison County · District Attorney&apos;s Office</Link><Link href="/investigator/intake">My intake</Link></header>
    <section className="investigator-ticket-heading"><Link href="/investigator/intake">← All reports</Link><p className="eyebrow">Criminal Division · Intake ticket</p><h1>{ticket.subject}</h1><div className="investigator-ticket-meta"><span className="pill pill-navy">{(ticket.intakeStatus ?? ticket.status).replaceAll("_", " ")}</span><span>{ticket.assignee?.displayName ? `Reviewer: ${ticket.assignee.displayName}` : "Waiting for assignment"}</span><span>Updated {dateFormat.format(ticket.updatedAt)}</span></div></section>
    {query.submitted === "1" && <p className="message message-success" role="status">Your submission was added to this ticket.</p>}
    {ticket.linkedCaseId && <p className="message message-success">This intake was opened as a case record. Court filing is a separate step.</p>}
    <div className="investigator-grid investigator-ticket-grid">
      <section className="investigator-panel"><h2>Reports and documents</h2><div className="investigator-document-list">{ticket.aopcs.map((doc) => <article key={doc.id} className="investigator-document"><header><div><strong>{doc.reportId || doc.title}</strong><span>{doc.documentType === "AOPC" ? "Affidavit of Probable Cause (AOPC)" : "Investigative Report"} · {doc.subject} · submitted {dateFormat.format(doc.createdAt)}</span></div><span className={`pill ${doc.status === "ACCEPTED" ? "pill-green" : doc.status === "REJECTED" ? "pill-red" : doc.status === "RETURNED" ? "pill-gold" : "pill-muted"}`}>{doc.status.replaceAll("_", " ")}</span></header><p>{doc.narrative}</p>{doc.reviewNote && <p className="message">Reviewer: {doc.reviewNote}</p>}{doc.pdfFileName && <a href={`/api/aopcs/${doc.id}/pdf`} target="_blank" rel="noreferrer">View {doc.pdfFileName} ↗</a>}{doc.documentUrl && <a href={doc.documentUrl} target="_blank" rel="noreferrer">Open source link ↗</a>}</article>)}</div>
        {ticket.intakeStatus !== "DENIED" && ticket.intakeStatus !== "CONVERTED" && ticket.status !== "CLOSED" && <details className="investigator-add-report"><summary>Add a supplemental document</summary><form action={addSupplementalReport.bind(null, ticket.id)} className="workbench-form" encType="multipart/form-data"><div className="field"><label htmlFor="supp-type">Document type</label><select id="supp-type" name="documentType" required defaultValue="INVESTIGATIVE_REPORT"><option value="AOPC">Affidavit of Probable Cause (AOPC)</option><option value="INVESTIGATIVE_REPORT">Investigative Report</option></select></div><div className="field"><label htmlFor="supp-title">Document title</label><input id="supp-title" name="title" required maxLength={180}/></div><div className="field"><label htmlFor="supp-report">Report number</label><input id="supp-report" name="reportId" maxLength={100}/></div><div className="field"><label htmlFor="supp-subject">Subject</label><input id="supp-subject" name="subject" required maxLength={180}/></div><div className="field field-wide"><label htmlFor="supp-narrative">Summary</label><textarea id="supp-narrative" name="narrative" rows={4} minLength={20} maxLength={20000} required/></div><div className="field field-wide"><label htmlFor="supp-pdf">PDF or source link</label><input id="supp-pdf" name="pdf" type="file" accept="application/pdf,.pdf"/><input name="documentUrl" type="url" maxLength={2000} placeholder="https:// source link"/><small>AOPCs require a PDF.</small></div><button className="govbtn-outline" type="submit">Add document</button></form></details>}
      </section>
      <section className="investigator-panel"><h2>Ticket conversation</h2><div className="investigator-messages">{ticket.messages.map((message) => <article className={message.authorId === access.user.id ? "investigator-message from-user" : "investigator-message"} key={message.id}><header><strong>{message.author.displayName}</strong><time>{dateFormat.format(message.createdAt)}</time></header><p>{message.body}</p></article>)}</div>{ticket.status !== "CLOSED" && <form action={investigatorReply.bind(null, ticket.id)} className="investigator-reply"><label htmlFor="reply-message">Reply to reviewer</label><textarea id="reply-message" name="message" rows={4} maxLength={8000} required/><button className="govbtn" type="submit">Send reply</button></form>}{ticket.linkedCaseId && <p className="note-inline">Case record opened. Contact the assigned attorney for case-specific follow-up.</p>}</section>
    </div>
    <footer className="investigator-footer"><Link href="/investigator/intake">Back to intake</Link><span>Portal review does not file a document with the court.</span></footer>
  </main>;
}

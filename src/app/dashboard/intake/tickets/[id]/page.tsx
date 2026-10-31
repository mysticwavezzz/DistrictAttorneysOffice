import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser, canReviewDivision } from "@/lib/case-access";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { investigatorReviewAction } from "@/app/investigator/intake/actions";

export const metadata = { title: "Investigator Intake Review | DAO", robots: { index: false, follow: false } };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

export default async function InvestigatorReviewTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION))) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  const { id } = await params;
  const ticket = await prisma.contactTicket.findFirst({ where: { id, category: "INVESTIGATOR_INTAKE" }, include: {
    requester: { select: { displayName: true, username: true } },
    assignee: { select: { displayName: true } },
    messages: { include: { author: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } },
    aopcs: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, documentType: true, reportId: true, subject: true, narrative: true, pdfFileName: true, documentUrl: true, status: true, reviewNote: true, createdAt: true } },
  } });
  if (!user || !ticket || ticket.division !== "Criminal Division" || (ticket.assigneeId !== user.id && !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS)) || !canReviewDivision(session.user.tiers, user.division, ticket.division, user.divisionGroup, ticket.divisionGroup)) notFound();
  const canOpenCase = hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) && ticket.intakeStatus === "APPROVED" && !ticket.linkedCaseId;
  const acceptedAopc = ticket.aopcs.some((doc) => doc.documentType === "AOPC" && doc.status === "ACCEPTED");
  return <div className="investigator-review-page">
    <p className="eyebrow">Criminal Division · Investigator Intake</p><p><Link href="/dashboard/review?type=investigator">← Review Inbox</Link></p>
    <div className="workbench-section-heading"><div><h1>{ticket.subject}</h1><p className="lede">Submitted by {ticket.requester.displayName} (@{ticket.requester.username}) · {dateFormat.format(ticket.createdAt)}</p></div><span className={`pill ${ticket.intakeStatus === "APPROVED" ? "pill-green" : ticket.intakeStatus === "NEEDS_INFO" ? "pill-gold" : ticket.intakeStatus === "DENIED" ? "pill-red" : "pill-navy"}`}>{ticket.intakeStatus ?? ticket.status}</span></div>
    <div className="investigator-review-grid">
      <section className="workbench-panel"><h2>Submitted documents</h2>{ticket.aopcs.map((doc) => <article className="investigator-document" key={doc.id}><header><div><strong>{doc.reportId || doc.title}</strong><span>{doc.documentType === "AOPC" ? "Affidavit of Probable Cause (AOPC)" : "Investigative Report"} · {doc.subject} · {dateFormat.format(doc.createdAt)}</span></div><span className="pill pill-muted">{doc.status}</span></header><p>{doc.narrative}</p>{doc.reviewNote && <p className="message">Last review note: {doc.reviewNote}</p>}{doc.pdfFileName && <p><a href={`/api/aopcs/${doc.id}/pdf`} target="_blank" rel="noreferrer">View {doc.pdfFileName} ↗</a></p>}{doc.documentUrl && <p><a href={doc.documentUrl} target="_blank" rel="noreferrer">Open source link ↗</a></p>}
        {doc.status === "PENDING" || doc.status === "RETURNED" ? <div className="investigator-review-actions"><form action={investigatorReviewAction.bind(null, ticket.id)}><input type="hidden" name="documentId" value={doc.id}/><input type="hidden" name="decision" value="ACCEPTED"/><button className="govbtn" type="submit">Accept {doc.documentType === "AOPC" ? "AOPC" : "investigative report"}</button></form><form action={investigatorReviewAction.bind(null, ticket.id)}><input type="hidden" name="documentId" value={doc.id}/><div className="field"><label htmlFor={`review-note-${doc.id}`}>Reason or corrections</label><textarea id={`review-note-${doc.id}`} name="note" rows={2} maxLength={1000} required/></div><button className="govbtn-outline" type="submit" name="decision" value="RETURNED">Return for correction</button><button className="govbtn-outline" type="submit" name="decision" value="REJECTED">Deny document</button></form></div> : null}
      </article>)}</section>
      <div className="investigator-review-side"><section className="workbench-panel"><h2>Reviewer decision</h2><p className="note-inline">Approval accepts the submitted documents for staff case-opening review. It does not itself file anything with the court.</p>{ticket.intakeStatus === "APPROVED" && !acceptedAopc && <p className="message">This intake contains an investigative report but no approved AOPC. The attorney must attach a separate AOPC PDF in the case-opening workflow before the case record can be created.</p>}{ticket.intakeStatus !== "APPROVED" && ticket.intakeStatus !== "DENIED" && ticket.intakeStatus !== "CONVERTED" && <><form action={investigatorReviewAction.bind(null, ticket.id)}><input type="hidden" name="ticketAction" value="approve"/><button className="govbtn" type="submit">Approve intake</button></form><form action={investigatorReviewAction.bind(null, ticket.id)} className="investigator-review-actions"><div className="field"><label htmlFor="ticket-review-note">Message the investigator</label><textarea id="ticket-review-note" name="note" rows={3} maxLength={1000} required/></div><button className="govbtn-outline" type="submit" name="ticketAction" value="request-info">Request more information</button><button className="govbtn-outline" type="submit" name="ticketAction" value="deny">Deny intake</button></form></>}{canOpenCase && <Link className="govbtn" href={`/dashboard/cases/new?intakeTicketId=${ticket.id}`}>Continue to case opening</Link>}{ticket.linkedCaseId && <p><Link href={`/dashboard/cases/${ticket.linkedCaseId}`}>Open linked case ↗</Link></p>}{ticket.intakeStatus === "APPROVED" && !canOpenCase && <p className="note-inline">This intake is approved and waiting for an attorney with case-opening authority.</p>}</section>
      <section className="workbench-panel"><h2>Conversation</h2><div className="investigator-messages">{ticket.messages.map((message) => <article className="investigator-message" key={message.id}><header><strong>{message.author.displayName}</strong><time>{dateFormat.format(message.createdAt)}</time></header><p>{message.body}</p></article>)}</div><p className="note-inline">Reply from the linked ticket in Investigator Intake. The reviewer can also request information above.</p></section></div>
    </div>
  </div>;
}

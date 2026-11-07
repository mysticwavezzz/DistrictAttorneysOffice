"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInvestigatorRobloxIds } from "@/lib/investigator-intake";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { canReviewDivision } from "@/lib/case-access";
import { parseStoredTiers } from "@/lib/contact-mail";
import { readCasePdf } from "@/lib/filing-upload";
import { notify, notifyMany } from "@/lib/notifications";
import { runWithActionDebug } from "@/lib/action-debug";

async function investigator() {
  const session = await auth();
  const id = session?.user?.identityProvider === "roblox" ? session.user.robloxUserId : null;
  if (!session?.user?.providerUserId || !id || !(await getInvestigatorRobloxIds()).includes(id)) throw new Error("This Roblox account is not authorized for Investigator Intake.");
  const user = await prisma.user.upsert({
    where: { robloxUserId: id },
    update: { username: session.user.username, displayName: session.user.displayName, avatarUrl: session.user.avatarUrl ?? null },
    create: { robloxUserId: id, username: session.user.username, displayName: session.user.displayName, avatarUrl: session.user.avatarUrl ?? null },
  });
  return { session, user };
}

async function assignReviewer() {
  const users = await prisma.user.findMany({ where: { division: "Criminal Division" }, select: { id: true, tiers: true, divisionGroup: true } });
  const reviewers = users.filter((user) => {
    const tiers = parseStoredTiers(user.tiers);
    return hasCapability(tiers, CAPABILITIES.CASES_APPROVE_DIVISION) || hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS) || hasCapability(tiers, CAPABILITIES.INVESTIGATOR_REVIEW);
  });
  if (!reviewers.length) return null;
  const loads = await Promise.all(reviewers.map(async (user) => ({
    ...user,
    load: await prisma.contactTicket.count({ where: { category: "INVESTIGATOR_INTAKE", assigneeId: user.id, status: { not: "CLOSED" }, intakeStatus: { notIn: ["DENIED", "CONVERTED"] } } }),
  })));
  loads.sort((a, b) => a.load - b.load || a.id.localeCompare(b.id));
  return loads[0];
}

async function parseDocument(formData: FormData) {
  const urlRaw = String(formData.get("documentUrl") ?? "").trim();
  let documentUrl: string | null = null;
  if (urlRaw) {
    try { const parsed = new URL(urlRaw); if (!["https:", "http:"].includes(parsed.protocol)) throw new Error(); documentUrl = parsed.toString(); }
    catch { throw new Error("Enter a valid HTTP or HTTPS source link."); }
  }
  const pdf = await readCasePdf(formData.get("pdf"));
  if (!pdf && !documentUrl) throw new Error("Attach a PDF or provide a source link.");
  return { pdf, documentUrl };
}

async function createTicketImpl(formData: FormData): Promise<void> {
  const { user } = await investigator();
  const documentType = String(formData.get("documentType") ?? "");
  if (documentType !== "AOPC" && documentType !== "INVESTIGATIVE_REPORT") throw new Error("Choose AOPC or Investigative Report.");
  const title = String(formData.get("title") ?? "").trim().slice(0, 180);
  const reportId = String(formData.get("reportId") ?? "").trim().slice(0, 100);
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 180);
  const narrative = String(formData.get("narrative") ?? "").trim().slice(0, 20000);
  const { pdf, documentUrl } = await parseDocument(formData);
  if (!title || !subject || narrative.length < 20) throw new Error("Complete the report title, subject, narrative, and supporting document.");
  if (documentType === "AOPC" && !pdf) throw new Error("An AOPC must include its PDF. A source link alone is not enough.");
  if (reportId) {
    const duplicate = await prisma.aopc.findFirst({ where: { reportId, targetUnit: "Criminal Division", status: { in: ["PENDING", "ACCEPTED", "RETURNED"] } }, select: { id: true, title: true } });
    if (duplicate) throw new Error(`Report number already exists in the active queue: ${duplicate.title}. Open that ticket to add information instead.`);
  }
  const reviewer = await assignReviewer();
  const ticket = await prisma.contactTicket.create({ data: {
    subject: title, category: "INVESTIGATOR_INTAKE", status: "OPEN", intakeStatus: "OPEN", division: "Criminal Division",
    divisionGroup: reviewer?.divisionGroup ?? null, requesterId: user.id, assigneeId: reviewer?.id ?? null,
    messages: { create: { authorId: user.id, body: `Initial submission: ${subject}\n\n${narrative}` } },
    aopcs: { create: { title, documentType, reportId: reportId || null, targetUnit: "Criminal Division", subject, narrative, documentUrl, pdfData: pdf?.pdfData ?? null, pdfFileName: pdf?.pdfFileName ?? null, status: "PENDING", submittedById: user.id } },
  }, select: { id: true } });
  const reviewerIds = reviewer ? [reviewer.id] : await reviewerIdsFallback();
  if (reviewerIds.length) await notifyMany(reviewerIds.filter((id) => id !== user.id), { type: "aopc_review", title: "Investigator report needs review", body: `${reportId || title} · ${user.displayName}`, link: `/dashboard/intake/tickets/${ticket.id}` }).catch((error) => console.error("Investigator ticket notification failed", error));
  revalidatePath("/investigator/intake");
  revalidatePath("/dashboard/review");
  redirect(`/investigator/intake/tickets/${ticket.id}?submitted=1`);
}

async function reviewerIdsFallback(): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { division: "Criminal Division" }, select: { id: true, tiers: true } });
  return users.filter((user) => { const tiers = parseStoredTiers(user.tiers); return hasCapability(tiers, CAPABILITIES.CASES_APPROVE_DIVISION) || hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS) || hasCapability(tiers, CAPABILITIES.INVESTIGATOR_REVIEW); }).map((user) => user.id);
}

async function replyImpl(ticketId: string, formData: FormData) {
  const { user } = await investigator();
  const body = String(formData.get("message") ?? "").trim().slice(0, 8000);
  if (!body) throw new Error("Write a message first.");
  const ticket = await prisma.contactTicket.findFirst({ where: { id: ticketId, category: "INVESTIGATOR_INTAKE", requesterId: user.id }, select: { id: true, status: true, assigneeId: true, subject: true } });
  if (!ticket || ticket.status === "CLOSED") throw new Error("This intake ticket is unavailable or closed.");
  await prisma.contactMessage.create({ data: { ticketId, authorId: user.id, body } });
  await prisma.contactTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
  if (ticket.assigneeId) await notify({ userId: ticket.assigneeId, type: "aopc_review", title: "Investigator replied to an intake ticket", body: ticket.subject, link: `/dashboard/intake/tickets/${ticketId}` }).catch(() => undefined);
  revalidatePath(`/investigator/intake/tickets/${ticketId}`);
  revalidatePath(`/dashboard/intake/tickets/${ticketId}`);
}

async function supplementalImpl(ticketId: string, formData: FormData): Promise<void> {
  const { user } = await investigator();
  const documentType = String(formData.get("documentType") ?? "");
  if (documentType !== "AOPC" && documentType !== "INVESTIGATIVE_REPORT") throw new Error("Choose AOPC or Investigative Report.");
  const title = String(formData.get("title") ?? "").trim().slice(0, 180);
  const reportId = String(formData.get("reportId") ?? "").trim().slice(0, 100);
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 180);
  const narrative = String(formData.get("narrative") ?? "").trim().slice(0, 20000);
  const { pdf, documentUrl } = await parseDocument(formData);
  const ticket = await prisma.contactTicket.findFirst({ where: { id: ticketId, category: "INVESTIGATOR_INTAKE", requesterId: user.id }, select: { id: true, status: true, intakeStatus: true, assigneeId: true } });
  if (!ticket || ticket.status === "CLOSED" || ["DENIED", "CONVERTED"].includes(ticket.intakeStatus ?? "")) throw new Error("This intake ticket cannot accept more documents.");
  if (!title || !subject || narrative.length < 20) throw new Error("Complete the document title, subject, and narrative.");
  if (documentType === "AOPC" && !pdf) throw new Error("An AOPC must include its PDF. A source link alone is not enough.");
  await prisma.aopc.create({ data: { intakeTicketId: ticket.id, title, documentType, reportId: reportId || null, targetUnit: "Criminal Division", subject, narrative, documentUrl, pdfData: pdf?.pdfData ?? null, pdfFileName: pdf?.pdfFileName ?? null, status: "PENDING", submittedById: user.id } });
  await prisma.contactMessage.create({ data: { ticketId, authorId: user.id, body: `Supplemental report submitted: ${title}` } });
  await prisma.contactTicket.update({ where: { id: ticketId }, data: { intakeStatus: "OPEN", status: "OPEN", updatedAt: new Date() } });
  if (ticket.assigneeId) await notify({ userId: ticket.assigneeId, type: "aopc_review", title: "Supplemental investigator report needs review", body: title, link: `/dashboard/intake/tickets/${ticketId}` }).catch(() => undefined);
  revalidatePath(`/investigator/intake/tickets/${ticketId}`);
  revalidatePath(`/dashboard/intake/tickets/${ticketId}`);
  revalidatePath("/dashboard/review");
  redirect(`/investigator/intake/tickets/${ticketId}?submitted=1`);
}

async function reviewerActionImpl(ticketId: string, formData: FormData) {
  const session = await auth();
  const attorneyReview = Boolean(session?.user && (hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION) || hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS)));
  const canReviewAllInvestigator = Boolean(session?.user && hasCapability(session.user.tiers, CAPABILITIES.INVESTIGATOR_REVIEW));
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) && !canReviewAllInvestigator)) throw new Error("Forbidden");
  const reviewer = await prisma.user.findFirst({ where: { robloxUserId: session.user.robloxUserId ?? "" }, select: { id: true, division: true, divisionGroup: true } });
  const ticket = await prisma.contactTicket.findFirst({ where: { id: ticketId, category: "INVESTIGATOR_INTAKE" }, include: { requester: { select: { id: true } } } });
  if (!reviewer || !ticket || ticket.division !== "Criminal Division" || (!canReviewAllInvestigator && ticket.assigneeId !== reviewer.id && !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS)) || (!canReviewAllInvestigator && !canReviewDivision(session.user.tiers, reviewer.division, ticket.division, reviewer.divisionGroup, ticket.divisionGroup))) throw new Error("This ticket is outside your review assignment.");
  const action = String(formData.get("ticketAction") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const docId = String(formData.get("documentId") ?? "").trim();
  if (docId) {
    const decision = String(formData.get("decision") ?? "");
    if (!["ACCEPTED", "RETURNED", "REJECTED"].includes(decision) || ((decision === "RETURNED" || decision === "REJECTED") && !note)) throw new Error("Choose a document decision and include a note when returning or denying it.");
    const document = await prisma.aopc.findFirst({ where: { id: docId, intakeTicketId: ticket.id }, select: { documentType: true } });
    if (!document) throw new Error("This document is not part of the intake ticket.");
    if (!attorneyReview && (document.documentType !== "INVESTIGATIVE_REPORT" || decision === "REJECTED")) throw new Error("Investigators may review investigative reports and return corrections. An attorney must accept an AOPC or deny a document.");
    const result = await prisma.aopc.updateMany({ where: { id: docId, intakeTicketId: ticket.id, status: { in: ["PENDING", "RETURNED"] } }, data: { status: decision, reviewedById: reviewer.id, reviewedAt: new Date(), reviewNote: note || null } });
    if (!result.count) throw new Error("This document was already reviewed.");
    await prisma.contactMessage.create({ data: { ticketId, authorId: reviewer.id, body: `${decision === "ACCEPTED" ? "Accepted" : decision === "RETURNED" ? "Returned for correction" : "Denied"} document: ${note || "No additional note."}` } });
    if (decision === "RETURNED") await prisma.contactTicket.update({ where: { id: ticketId }, data: { intakeStatus: "NEEDS_INFO", updatedAt: new Date() } });
    await notify({ userId: ticket.requesterId, type: "aopc_reviewed", title: `Intake document ${decision === "ACCEPTED" ? "accepted" : decision === "RETURNED" ? "returned" : "denied"}`, body: `${ticket.subject}${note ? ` · ${note}` : ""}`, link: `/investigator/intake/tickets/${ticketId}` }).catch(() => undefined);
  } else if (action === "request-info" || action === "deny") {
    if (action === "deny" && !attorneyReview) throw new Error("Only an attorney may deny an intake. Investigators may request corrections or more information.");
    if (!note) throw new Error("Add a message for the investigator.");
    const intakeStatus = action === "request-info" ? "NEEDS_INFO" : "DENIED";
    await prisma.contactTicket.update({ where: { id: ticketId }, data: { intakeStatus, status: action === "deny" ? "CLOSED" : "OPEN", updatedAt: new Date() } });
    await prisma.contactMessage.create({ data: { ticketId, authorId: reviewer.id, body: `${action === "deny" ? "Intake denied" : "Additional information requested"}: ${note}` } });
    await notify({ userId: ticket.requesterId, type: "aopc_reviewed", title: action === "deny" ? "Investigator intake denied" : "More information requested", body: note, link: `/investigator/intake/tickets/${ticketId}` }).catch(() => undefined);
  } else if (action === "approve") {
    if (!attorneyReview) throw new Error("Only an attorney may approve an intake for case-opening review.");
    const pending = await prisma.aopc.count({ where: { intakeTicketId: ticketId, status: "PENDING" } });
    const accepted = await prisma.aopc.count({ where: { intakeTicketId: ticketId, status: "ACCEPTED" } });
    if (pending || !accepted) throw new Error("Accept at least one report and finish every pending document before approving the ticket.");
    await prisma.contactTicket.update({ where: { id: ticketId }, data: { intakeStatus: "APPROVED", status: "OPEN", updatedAt: new Date() } });
    await prisma.contactMessage.create({ data: { ticketId, authorId: reviewer.id, body: "Intake approved for case-opening review. This does not open or file a court case." } });
    await notify({ userId: ticket.requesterId, type: "aopc_reviewed", title: "Investigator intake approved", body: ticket.subject, link: `/investigator/intake/tickets/${ticketId}` }).catch(() => undefined);
  } else throw new Error("Choose a valid intake action.");
  revalidatePath(`/dashboard/intake/tickets/${ticketId}`);
  revalidatePath(`/investigator/intake/tickets/${ticketId}`);
  revalidatePath("/dashboard/review");
}

export async function createInvestigatorTicket(formData: FormData) { return runWithActionDebug("createInvestigatorTicket", [formData], () => createTicketImpl(formData)); }
export async function investigatorReply(ticketId: string, formData: FormData) { return runWithActionDebug("investigatorReply", [ticketId, formData], () => replyImpl(ticketId, formData)); }
export async function addSupplementalReport(ticketId: string, formData: FormData) { return runWithActionDebug("addSupplementalReport", [ticketId, formData], () => supplementalImpl(ticketId, formData)); }
export async function investigatorReviewAction(ticketId: string, formData: FormData) { return runWithActionDebug("investigatorReviewAction", [ticketId, formData], () => reviewerActionImpl(ticketId, formData)); }

"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { localUser } from "@/lib/case-access";
import { prisma } from "@/lib/prisma";
import { notify, notifyMany } from "@/lib/notifications";
import { canRouteContactMail, canViewAllContactMail, isAssignableContactEmployee, isContactAttorney, parseStoredTiers } from "@/lib/contact-mail";
import { PERMISSION_TIERS } from "@/lib/permissions/tiers";
import { UNITS } from "@/config/units";
import { getSiteConfiguration } from "@/lib/site-settings";
import { runWithActionDebug } from "@/lib/action-debug";

async function currentIdentity() {
  const session = await auth();
  if (!session?.user?.providerUserId || session.user.identityProvider !== "roblox") throw new Error("Sign in with Roblox to use Contact Us.");
  const user = await localUser(session.user);
  if (!user) throw new Error("Your Roblox profile is not available. Sign in again.");
  return { session, user, tiers: session.user.tiers };
}

async function officeReviewers() {
  const users = await prisma.user.findMany({ select: { id: true, tiers: true } });
  return users.filter((user) => {
    const tiers = parseStoredTiers(user.tiers);
    return [PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY, PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY, PERMISSION_TIERS.DISTRICT_ATTORNEY].some((tier) => tiers.includes(tier)) || tiers.includes("developer_profile");
  }).map((user) => user.id);
}

async function createContactTicketImpl(formData: FormData): Promise<string> {
  const { user } = await currentIdentity();
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 120);
  const body = String(formData.get("message") ?? "").trim().slice(0, 8000);
  const division = String(formData.get("division") ?? "").trim().slice(0, 100);
  const attorneyId = String(formData.get("attorneyId") ?? "").trim();
  if (subject.length < 3 || body.length < 5) throw new Error("Add a subject and a message before sending.");
  const divisions = await getSiteConfiguration("divisions", UNITS);
  if (!divisions.some((item) => item.value === division)) throw new Error("Choose a valid division.");
  const attorney = await prisma.user.findUnique({ where: { id: attorneyId }, select: { id: true, robloxUserId: true, tiers: true, username: true } });
  if (!attorney || !isContactAttorney(parseStoredTiers(attorney.tiers)) || !attorney.robloxUserId) throw new Error("Choose an active ADA-or-higher attorney.");
  const rosterEntry = await prisma.rosterEntry.findUnique({ where: { robloxUserId: attorney.robloxUserId }, select: { isActive: true, unit: true, rank: true } });
  const officeWide = (rosterEntry?.rank === "District Attorney" || rosterEntry?.rank === "Deputy District Attorney") && !rosterEntry.unit;
  if (!rosterEntry?.isActive || (rosterEntry.unit && rosterEntry.unit !== division) || (!rosterEntry.unit && !officeWide)) throw new Error("That attorney is not currently assigned to the selected division. Refresh and choose another attorney.");
  const ticket = await prisma.contactTicket.create({
    data: { subject, division, assigneeId: attorney.id, requesterId: user.id, messages: { create: { authorId: user.id, body } } },
    select: { id: true },
  });
  try { await notifyMany([attorney.id, ...await officeReviewers()], { type: "contact_mail", title: "New Contact Us ticket", body: `A new private message was sent to you for ${division}.`, link: `/dashboard/contact-mail/${ticket.id}` }); }
  catch (error) { console.error("Contact ticket was saved, but reviewer notification failed", error); }
  revalidatePath("/contacts");
  revalidatePath("/dashboard/review");
  return ticket.id;
}

async function sendContactReplyImpl(ticketId: string, formData: FormData): Promise<void> {
  const { user, tiers } = await currentIdentity();
  const body = String(formData.get("message") ?? "").trim().slice(0, 8000);
  if (!ticketId || body.length < 1) throw new Error("Write a message before sending.");
  const ticket = await prisma.contactTicket.findUnique({ where: { id: ticketId }, select: { id: true, requesterId: true, assigneeId: true, status: true, subject: true } });
  if (!ticket || (!canViewAllContactMail(tiers) && ticket.requesterId !== user.id && ticket.assigneeId !== user.id)) throw new Error("This ticket is not available to your account.");
  if (ticket.status === "CLOSED") throw new Error("This ticket is closed.");
  await prisma.contactMessage.create({ data: { ticketId, authorId: user.id, body } });
  const recipients = user.id === ticket.requesterId
    ? ticket.assigneeId ? [ticket.assigneeId] : await officeReviewers()
    : [ticket.requesterId];
  try { await notifyMany(recipients, { type: "contact_mail", title: "New reply in Contact Us", body: `There is a new reply about: ${ticket.subject}`, link: user.id === ticket.requesterId ? `/dashboard/contact-mail/${ticket.id}` : `/contacts?ticket=${ticket.id}` }); }
  catch (error) { console.error("Contact reply was saved, but notification delivery failed", error); }
  await prisma.contactTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
  revalidatePath("/contacts");
  revalidatePath(`/dashboard/contact-mail/${ticketId}`);
  revalidatePath("/dashboard/review");
}

async function manageContactTicketImpl(ticketId: string, formData: FormData): Promise<void> {
  const { user, tiers } = await currentIdentity();
  if (!canRouteContactMail(tiers)) throw new Error("Only division supervisors and above can route tickets.");
  const targetAssigneeId = String(formData.get("assigneeId") ?? "").trim() || null;
  const action = String(formData.get("ticketAction") ?? "");
  const ticket = await prisma.contactTicket.findUnique({ where: { id: ticketId }, select: { id: true, status: true, assigneeId: true, subject: true } });
  if (!ticket) throw new Error("Ticket not found.");
  if (targetAssigneeId) {
    const target = await prisma.user.findUnique({ where: { id: targetAssigneeId }, select: { id: true, tiers: true } });
    if (!target || !isAssignableContactEmployee(parseStoredTiers(target.tiers))) throw new Error("Choose an active staff account.");
  }
  let data: { assigneeId?: string | null; status?: string; heldAt?: Date | null; closedAt?: Date | null };
  if (action === "assign") {
    data = { assigneeId: targetAssigneeId, status: "OPEN", heldAt: null, closedAt: null };
  } else if (action === "hold") {
    if (!canViewAllContactMail(tiers) && ticket.assigneeId !== user.id) throw new Error("Only the assigned employee or office leadership can hold this ticket.");
    data = { status: "ON_HOLD", heldAt: new Date() };
  } else if (action === "close") {
    if (!canViewAllContactMail(tiers) && ticket.assigneeId !== user.id) throw new Error("Only the assigned employee or office leadership can close this ticket.");
    data = { status: "CLOSED", closedAt: new Date() };
  } else if (action === "reopen") {
    data = { status: "OPEN", closedAt: null, heldAt: null };
  } else {
    throw new Error("Choose a valid ticket action.");
  }
  await prisma.contactTicket.update({ where: { id: ticket.id }, data });
  if (action === "assign" && targetAssigneeId && targetAssigneeId !== user.id) {
    try { await notify({ userId: targetAssigneeId, type: "contact_mail", title: "Contact Us ticket assigned to you", body: `A private ticket needs attention: ${ticket.subject}`, link: `/dashboard/contact-mail/${ticket.id}` }); }
    catch (error) { console.error("Ticket routing was saved, but assignee notification failed", error); }
  }
  await prisma.contactMessage.create({ data: { ticketId, authorId: user.id, body: action === "assign" ? targetAssigneeId ? "Ticket routed to a staff member." : "Ticket returned to the unassigned review inbox." : action === "hold" ? "Ticket placed on hold." : action === "close" ? "Ticket closed." : "Ticket reopened." } });
  if (action !== "assign") {
    const updatedTicket = await prisma.contactTicket.findUniqueOrThrow({ where: { id: ticketId }, select: { requesterId: true } });
    try { await notify({ userId: updatedTicket.requesterId, type: "contact_mail", title: action === "hold" ? "Your Contact Us ticket was placed on hold" : action === "close" ? "Your Contact Us ticket was closed" : "Your Contact Us ticket was reopened", body: `Ticket: ${ticket.subject}`, link: `/contacts?ticket=${ticket.id}` }); }
    catch (error) { console.error("Ticket status was saved, but requester notification failed", error); }
  }
  revalidatePath("/contacts");
  revalidatePath(`/dashboard/contact-mail/${ticketId}`);
  revalidatePath("/dashboard/review");
}

async function canAssignContactMailImpl(): Promise<boolean> {
  const { tiers } = await currentIdentity();
  return canRouteContactMail(tiers);
}

export async function createContactTicket(formData: FormData): Promise<string> { return runWithActionDebug("createContactTicket", [formData], () => createContactTicketImpl(formData)); }
export async function sendContactReply(ticketId: string, formData: FormData): Promise<void> { return runWithActionDebug("sendContactReply", [ticketId, formData], () => sendContactReplyImpl(ticketId, formData)); }
export async function manageContactTicket(ticketId: string, formData: FormData): Promise<void> { return runWithActionDebug("manageContactTicket", [ticketId, formData], () => manageContactTicketImpl(ticketId, formData)); }
export async function canAssignContactMail(): Promise<boolean> { return runWithActionDebug("canAssignContactMail", [], () => canAssignContactMailImpl()); }

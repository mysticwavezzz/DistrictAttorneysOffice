import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { localUser } from "@/lib/case-access";
import { canRouteContactMail, canViewContactMail, canViewAllContactMail, isAssignableContactEmployee, parseStoredTiers } from "@/lib/contact-mail";
import { prisma } from "@/lib/prisma";
import { StaffContactTicket } from "@/components/staff-contact-ticket";
import { manageContactTicket } from "@/app/contacts/actions";

export const dynamic = "force-dynamic";
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function ContactTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.providerUserId || session.user.identityProvider !== "roblox") redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const { id } = await params;
  const ticket = await prisma.contactTicket.findUnique({ where: { id }, include: { requester: { select: { id: true, username: true, robloxUserId: true } }, assignee: { select: { id: true, username: true } }, messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, username: true } } } } } });
  if (!ticket || !canViewContactMail(session.user.tiers, user.id, ticket)) notFound();
  const canRoute = canRouteContactMail(session.user.tiers);
  const isAssignee = ticket.assigneeId === user.id;
  const canManageStatus = canViewAllContactMail(session.user.tiers) || isAssignee;
  const staffCandidates = canRoute ? await prisma.user.findMany({ where: { id: { not: ticket.requesterId } }, select: { id: true, username: true, tiers: true, division: true }, orderBy: { username: "asc" } }) : [];
  const assignable = staffCandidates.filter((candidate) => isAssignableContactEmployee(parseStoredTiers(candidate.tiers)));

  return <main className="dashboard-main">
    <div className="review-inbox"><p className="eyebrow">Private Contact Us ticket · {ticket.division ?? "Division not selected"}</p><h1>{ticket.subject}</h1><p className="lede">From {ticket.requester.username} · Roblox ID {ticket.requester.robloxUserId ?? "not available"}</p>
      <p><Link href="/dashboard/review">← Review inbox</Link> · <Link href="/contacts">Your mailbox</Link></p>
      <section className="formbox contact-staff-controls"><h2>Ticket controls</h2><dl><div><dt>Status</dt><dd>{ticket.status.replace("_", " ")}</dd></div><div><dt>Assigned to</dt><dd>{ticket.assignee?.username ?? "Unassigned review inbox"}</dd></div><div><dt>Opened</dt><dd>{dateFormat.format(ticket.createdAt)}</dd></div><div><dt>Last updated</dt><dd>{dateFormat.format(ticket.updatedAt)}</dd></div></dl>
      {canRoute && <form action={manageContactTicket.bind(null, ticket.id)} className="contact-route-form"><label htmlFor="contact-assignee">Route to staff member</label><select id="contact-assignee" name="assigneeId" defaultValue={ticket.assigneeId ?? ""}><option value="">Unassigned review inbox</option>{assignable.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.username}{candidate.division ? ` · ${candidate.division}` : ""}</option>)}</select><button className="govbtn-outline" name="ticketAction" value="assign" type="submit">Save routing</button></form>}
      {canManageStatus && <div className="contact-ticket-actions">{ticket.status !== "ON_HOLD" && ticket.status !== "CLOSED" && <form action={manageContactTicket.bind(null, ticket.id)}><button className="govbtn-outline" name="ticketAction" value="hold">Place on hold</button></form>}{ticket.status !== "CLOSED" && <form action={manageContactTicket.bind(null, ticket.id)}><button className="govbtn-outline" name="ticketAction" value="close">Close ticket</button></form>}{ticket.status === "CLOSED" && <form action={manageContactTicket.bind(null, ticket.id)}><button className="govbtn" name="ticketAction" value="reopen">Reopen ticket</button></form>}</div>}
      </section>
      <section className="formbox"><h2>Conversation</h2><StaffContactTicket currentUserId={user.id} initialTicket={{ id: ticket.id, subject: ticket.subject, status: ticket.status, requesterId: ticket.requesterId, assigneeId: ticket.assigneeId, messages: ticket.messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })) }} /></section>
    </div>
  </main>;
}

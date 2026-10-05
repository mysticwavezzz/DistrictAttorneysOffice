import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { localUser } from "@/lib/case-access";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { ContactMailbox } from "@/components/contact-mailbox";
import { UNITS } from "@/config/units";
import { getSiteConfiguration } from "@/lib/site-settings";
import { isContactAttorney, parseStoredTiers } from "@/lib/contact-mail";
import { shareMetadata } from "@/lib/share-metadata";

export const dynamic = "force-dynamic";
export const metadata = shareMetadata("Contact Us", "Send a private message to an attorney in the selected division.", "/contacts");

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const session = await auth();
  if (!session?.user?.providerUserId || session.user.identityProvider !== "roblox") redirect("/login?callbackUrl=/contacts");
  const user = await localUser(session.user);
  if (!user) redirect("/login?callbackUrl=/contacts");
  const tickets = await prisma.contactTicket.findMany({
    where: { requesterId: user.id },
    select: { id: true, subject: true, status: true, division: true, createdAt: true, updatedAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, body: true, createdAt: true, author: { select: { id: true, username: true } } } } },
    orderBy: { updatedAt: "desc" },
  });
  const configuredDivisions = await getSiteConfiguration("divisions", UNITS);
  const roster = await prisma.rosterEntry.findMany({ where: { isActive: true }, select: { robloxUserId: true, unit: true, rank: true } });
  const robloxIds = roster.flatMap((entry) => entry.robloxUserId ? [entry.robloxUserId] : []);
  const staff = robloxIds.length ? await prisma.user.findMany({ where: { robloxUserId: { in: robloxIds } }, select: { id: true, username: true, robloxUserId: true, tiers: true } }) : [];
  const staffByRobloxId = new Map(staff.flatMap((member) => member.robloxUserId ? [[member.robloxUserId, member] as const] : []));
  const attorneyChoices = roster.flatMap((entry) => {
    if (!entry.robloxUserId || !entry.rank) return [];
    const member = staffByRobloxId.get(entry.robloxUserId);
    if (!member || !isContactAttorney(parseStoredTiers(member.tiers))) return [];
    const officeWide = entry.rank === "District Attorney" || entry.rank === "Deputy District Attorney";
    const division = entry.unit ?? (officeWide ? "Office of the District Attorney" : null);
    if (!division) return [];
    return [{ id: member.id, username: member.username, division, officeWide: officeWide && !entry.unit }];
  });
  const availableDivisions = configuredDivisions.map(({ value, label }) => ({ value, label }));
  const query = await searchParams;
  return <div className="wrap">
    <a href="#main" className="skiplink">Skip to main content</a><SiteHeader />
    <div className="body"><Sidebar /><main className="paper" id="main">
      <p className="eyebrow">Private mailbox</p><h1>Contact Us</h1>
      <p className="lede">Send a private message to the office and follow replies here. Replies appear automatically while this page is open.</p>
      <ContactMailbox initialTickets={tickets.map((ticket) => ({ ...ticket, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(), messages: ticket.messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })) }))} initialTicketId={query.ticket ?? null} currentUserId={user.id} divisions={availableDivisions} attorneys={attorneyChoices} />
      <p className="note-inline">This mailbox is for website and office inquiries. Do not use it for emergencies or time-sensitive law-enforcement reports.</p>
    </main></div><SiteFooter />
  </div>;
}

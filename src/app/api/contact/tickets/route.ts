import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { localUser } from "@/lib/case-access";
import { canViewContactMail } from "@/lib/contact-mail";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.providerUserId || session.user.identityProvider !== "roblox") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const user = await localUser(session.user);
  if (!user) return NextResponse.json({ error: "Account unavailable." }, { status: 403 });
  const tickets = await prisma.contactTicket.findMany({
    where: { requesterId: user.id },
    select: { id: true, subject: true, status: true, assigneeId: true, createdAt: true, updatedAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, body: true, createdAt: true, author: { select: { id: true, username: true } } } } },
    orderBy: { updatedAt: "desc" },
  });
  const ticketId = new URL(request.url).searchParams.get("ticket");
  if (!ticketId) return NextResponse.json({ tickets }, { headers: { "Cache-Control": "no-store" } });
  const ticket = await prisma.contactTicket.findUnique({ where: { id: ticketId }, include: { messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, username: true } } } } } });
  if (!ticket || !canViewContactMail(session.user.tiers, user.id, ticket)) return NextResponse.json({ error: "Ticket unavailable." }, { status: 404 });
  return NextResponse.json({ tickets, ticket }, { headers: { "Cache-Control": "no-store" } });
}

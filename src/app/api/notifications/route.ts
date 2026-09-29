import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    return NextResponse.json({ unreadCount: 0, items: [] }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { discordUserId: session.user.discordUserId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ unreadCount: 0, items: [] });
  }

  const [unreadCount, items] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({ unreadCount, items });
}

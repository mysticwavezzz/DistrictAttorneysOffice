import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser } from "@/lib/case-access";

export async function GET() {
  const session = await auth();
  if (!session?.user?.providerUserId) {
    return NextResponse.json({ unreadCount: 0, items: [] }, { status: 401 });
  }

  const user = await localUser(session.user);
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

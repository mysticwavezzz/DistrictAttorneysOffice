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

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.providerUserId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const user = await localUser(session.user);
  if (!user) return NextResponse.json({ error: "Account unavailable." }, { status: 403 });

  let body: { id?: unknown; pathname?: unknown };
  try {
    body = await request.json() as { id?: unknown; pathname?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let ids: string[] = [];
  if (typeof body.id === "string" && body.id.length <= 100) {
    const item = await prisma.notification.findFirst({ where: { id: body.id, userId: user.id, isRead: false }, select: { id: true } });
    if (item) ids = [item.id];
  } else if (typeof body.pathname === "string" && body.pathname.startsWith("/") && !body.pathname.startsWith("//") && !body.pathname.includes("\\")) {
    let currentPath: string;
    try {
      const target = new URL(body.pathname, request.url);
      if (target.origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid route." }, { status: 400 });
      currentPath = target.pathname;
    } catch {
      return NextResponse.json({ error: "Invalid route." }, { status: 400 });
    }
    const unread = await prisma.notification.findMany({ where: { userId: user.id, isRead: false, link: { not: null } }, select: { id: true, link: true } });
    ids = unread.flatMap((item) => {
      if (!item.link) return [];
      try { return new URL(item.link, request.url).pathname === currentPath ? [item.id] : []; }
      catch { return []; }
    });
  } else {
    return NextResponse.json({ error: "Provide a notification ID or route." }, { status: 400 });
  }

  if (ids.length) await prisma.notification.updateMany({ where: { id: { in: ids }, userId: user.id, isRead: false }, data: { isRead: true } });
  return NextResponse.json({ markedIds: ids });
}

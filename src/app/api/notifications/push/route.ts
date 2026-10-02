import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { localUser } from "@/lib/case-access";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const subscriptionSchema = z.object({ endpoint: z.string().url().max(2048), keys: z.object({ p256dh: z.string().min(20).max(256), auth: z.string().min(10).max(256) }) });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([new URL(request.url).origin, env.NEXT_PUBLIC_SITE_URL ? new URL(env.NEXT_PUBLIC_SITE_URL).origin : ""].filter(Boolean));
  return allowed.has(origin);
}

async function currentUser() {
  const session = await auth();
  if (!session?.user?.providerUserId || session.user.identityProvider !== "roblox") return null;
  return localUser(session.user);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return NextResponse.json({ error: "Computer notifications are not configured on this website yet." }, { status: 503 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in with Roblox to enable notifications." }, { status: 401 });
  const input = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid browser subscription." }, { status: 400 });
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.data.endpoint },
    create: { userId: user.id, endpoint: input.data.endpoint, p256dh: input.data.keys.p256dh, auth: input.data.keys.auth },
    update: { userId: user.id, p256dh: input.data.keys.p256dh, auth: input.data.keys.auth },
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in with Roblox to manage notifications." }, { status: 401 });
  const input = z.object({ endpoint: z.string().url().max(2048) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid browser subscription." }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint: input.data.endpoint, userId: user.id } });
  return NextResponse.json({ success: true });
}

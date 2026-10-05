import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { trackedPublicPath } from "@/lib/analytics-path";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });

  let path: unknown;
  try {
    const body: unknown = await request.json();
    path = body && typeof body === "object" && "path" in body ? body.path : null;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (typeof path !== "string" || !trackedPublicPath(path)) return new NextResponse(null, { status: 204 });

  const ip = clientIpFromHeaders(request.headers);
  if (ip !== "unknown") {
    const limit = await checkRateLimit(`analytics-pageview:${ip}`, { limit: 120, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return new NextResponse(null, { status: 429 });
  }

  const day = new Date().toISOString().slice(0, 10);
  await prisma.siteAnalyticsDaily.upsert({
    where: { path_day: { path, day } },
    create: { path, day, views: 1 },
    update: { views: { increment: 1 } },
  });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { isCriminalDivisionTrainee, requiresCriminalDivisionOrientation } from "@/lib/onboarding-policy";

export async function GET(request: NextRequest) {
  if (request.headers.get("x-staff-access-check") !== env.AUTH_SECRET) return new Response(null, { status: 404 });
  const robloxUserId = request.nextUrl.searchParams.get("robloxUserId") ?? "";
  if (!/^\d{1,30}$/.test(robloxUserId)) return new Response(null, { status: 400 });
  const [revoked, roster] = await Promise.all([
    prisma.revokedStaffAccess.findUnique({ where: { robloxUserId }, select: { robloxUserId: true } }),
    prisma.rosterEntry.findUnique({ where: { robloxUserId }, select: { rankOverride: true, rank: true, unit: true, isActive: true, isProsecutorInTraining: true, orientationPending: true, orientationAcknowledgedAt: true } }),
  ]);
  return NextResponse.json({ revoked: Boolean(revoked), rankOverride: roster?.isActive ? roster.rankOverride : null, isProsecutorInTraining: isCriminalDivisionTrainee(roster), orientationPending: requiresCriminalDivisionOrientation(roster) }, {
    headers: { "Cache-Control": "no-store" },
  });
}

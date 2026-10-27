import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authResult = await authenticateLocalAutomationRequest(request, await request.text());
  if (!authResult.ok) return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });

  const { actor } = authResult;
  const canViewAll = hasCapability(actor.tiers, CAPABILITIES.ROSTER_VIEW);
  const canViewDivision = hasCapability(actor.tiers, CAPABILITIES.ROSTER_VIEW_DIVISION);
  const canViewOwnGroup = actor.tiers.includes("senior_assistant_district_attorney")
    && hasCapability(actor.tiers, CAPABILITIES.CASES_APPROVE_DIVISION)
    && actor.user.division === "Criminal Division"
    && Boolean(actor.user.divisionGroup);

  if (!canViewAll && !canViewDivision && !canViewOwnGroup) {
    return NextResponse.json({ error: "Your current role cannot view the staff roster." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const url = new URL(request.url);
  const requestedDivision = url.searchParams.get("division")?.trim() ?? "";
  if (requestedDivision.length > 100) return NextResponse.json({ error: "Division name is too long." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  let where: Prisma.RosterEntryWhereInput;
  if (canViewAll) {
    where = requestedDivision ? { unit: requestedDivision } : {};
  } else if (canViewDivision) {
    if (requestedDivision && requestedDivision !== actor.user.division) {
      return NextResponse.json({ error: "You may only view your assigned division." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    where = actor.user.division ? { unit: actor.user.division } : { OR: [{ unit: null }, { unit: "" }] };
  } else {
    if (requestedDivision && requestedDivision !== "Criminal Division") {
      return NextResponse.json({ error: "You may only view your assigned Criminal Division group." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    where = {
      unit: "Criminal Division",
      OR: [{ divisionGroup: actor.user.divisionGroup }, { divisionGroup: null }],
    };
  }

  const entries = await prisma.rosterEntry.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      name: true,
      rank: true,
      unit: true,
      divisionGroup: true,
      isActive: true,
      startDate: true,
      robloxSynced: true,
    },
  });

  return NextResponse.json({
    items: entries.map((entry) => ({ ...entry, startDate: entry.startDate?.toISOString() ?? null })),
    division: canViewAll ? requestedDivision || null : actor.user.division,
    groupLimited: !canViewAll && !canViewDivision,
  }, { headers: { "Cache-Control": "no-store" } });
}

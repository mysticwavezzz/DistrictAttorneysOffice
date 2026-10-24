import { NextResponse } from "next/server";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { caseVisibilityWhere, canViewCases, canAssignCase } from "@/lib/case-access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const rawBody = await request.text();
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });

  const { actor } = authResult;
  if (!canViewCases(actor.tiers)) return NextResponse.json({ error: "Your current role cannot view cases." }, { status: 403 });
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "mine";
  if (!["mine", "unassigned", "all"].includes(scope)) return NextResponse.json({ error: "Choose mine, unassigned, or all." }, { status: 400 });
  if (scope !== "mine" && !canAssignCase(actor.tiers, actor.user.division)) {
    return NextResponse.json({ error: "Your current role cannot view the assignable docket." }, { status: 403 });
  }

  const visibility = caseVisibilityWhere(actor.tiers, actor.user.id, actor.user.division, actor.user.divisionGroup);
  if (!visibility) return NextResponse.json({ error: "Your case access could not be verified." }, { status: 403 });
  const conditions = [visibility];
  if (scope === "mine") conditions.push({ assignedAttorneyId: actor.user.id });
  if (scope === "unassigned") conditions.push({ assignedAttorneyId: null });

  const limitValue = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isInteger(limitValue) ? Math.min(200, Math.max(1, limitValue)) : 100;
  const cursor = url.searchParams.get("cursor");
  if (cursor && cursor.length > 100) return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });

  const records = await prisma.case.findMany({
    where: { AND: conditions },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      caseNumber: true,
      title: true,
      type: true,
      stage: true,
      division: true,
      divisionGroup: true,
      assignedAttorneyId: true,
      archived: true,
      updatedAt: true,
      assignedAttorney: { select: { id: true, displayName: true } },
      createdBy: { select: { id: true, displayName: true } },
    },
  });
  const hasMore = records.length > limit;
  const items = records.slice(0, limit);
  return NextResponse.json({
    items,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    scope,
  }, { headers: { "Cache-Control": "no-store" } });
}

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { canManageCriminalGroupRosterEntry } from "@/lib/case-access";
import { isAssignableAttorneyRank } from "@/lib/case-assignees";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }

  let payload: { name?: unknown; divisionGroup?: unknown };
  try {
    payload = JSON.parse(rawBody) as { name?: unknown; divisionGroup?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const divisionGroup = payload.divisionGroup;
  if (!name || name.length > 100 || (divisionGroup !== "1" && divisionGroup !== "2")) {
    return NextResponse.json({ error: "Provide an attorney name and group 1 or 2." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const { actor } = authResult;
  const canManageAllRoster = hasCapability(actor.tiers, CAPABILITIES.ROSTER_MANAGE);
  const canManageCriminalDivisionRoster = actor.user.division === "Criminal Division"
    && hasCapability(actor.tiers, CAPABILITIES.ROSTER_MANAGE_DIVISION);
  const canManageOwnCriminalGroup = actor.user.division === "Criminal Division"
    && Boolean(actor.user.divisionGroup)
    && actor.tiers.includes("senior_assistant_district_attorney")
    && hasCapability(actor.tiers, CAPABILITIES.CASES_APPROVE_DIVISION);
  if (
    !(canManageAllRoster || canManageCriminalDivisionRoster || canManageOwnCriminalGroup)
    || !canManageCriminalGroupRosterEntry(actor.tiers, actor.user.division, actor.user.divisionGroup, "Criminal Division", null)
    || !canManageCriminalGroupRosterEntry(actor.tiers, actor.user.division, actor.user.divisionGroup, "Criminal Division", divisionGroup)
  ) {
    return NextResponse.json({ error: "Your current role cannot assign this Criminal Division group." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const matches = await prisma.rosterEntry.findMany({
    where: { name, unit: "Criminal Division" },
    select: { id: true, name: true, rank: true, unit: true, divisionGroup: true, isActive: true, robloxUserId: true },
  });
  if (matches.length !== 1) {
    return NextResponse.json({ error: matches.length ? "That roster name is ambiguous." : "No Criminal Division profile matched that name." }, { status: matches.length ? 409 : 404, headers: { "Cache-Control": "no-store" } });
  }

  const entry = matches[0];
  if (!entry) return NextResponse.json({ error: "No Criminal Division profile matched that name." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!entry.isActive) return NextResponse.json({ error: "Inactive roster profiles cannot be assigned to an active group." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  if (!isAssignableAttorneyRank(entry.rank)) return NextResponse.json({ error: "Only active attorney profiles can be assigned to a Criminal Division group." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (entry.divisionGroup) return NextResponse.json({ error: `${entry.name} is already in Group ${entry.divisionGroup}.` }, { status: 409, headers: { "Cache-Control": "no-store" } });

  let affectedCaseCount = 0;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.rosterEntry.updateMany({
      where: { id: entry.id, unit: "Criminal Division", isActive: true, divisionGroup: null },
      data: { divisionGroup },
    });
    if (updated.count !== 1) throw new Error("The roster profile changed during assignment. Refresh and retry.");

    if (entry.robloxUserId) {
      await tx.user.updateMany({ where: { robloxUserId: entry.robloxUserId }, data: { division: "Criminal Division", divisionGroup } });
      const linkedUser = await tx.user.findUnique({ where: { robloxUserId: entry.robloxUserId }, select: { id: true } });
      if (linkedUser) {
        const [assigned, created] = await Promise.all([
          tx.case.updateMany({ where: { division: "Criminal Division", assignedAttorneyId: linkedUser.id }, data: { divisionGroup } }),
          tx.case.updateMany({ where: { division: "Criminal Division", assignedAttorneyId: null, createdById: linkedUser.id }, data: { divisionGroup } }),
        ]);
        affectedCaseCount = assigned.count + created.count;
      }
    }
  });

  await logActivity(actor.user.displayName, "assigned to group", "roster entry", entry.name);
  revalidatePath("/dashboard/roster");
  revalidatePath("/dashboard/cases");

  return NextResponse.json({
    name: entry.name,
    previousGroup: null,
    divisionGroup,
    affectedCaseCount,
  }, { headers: { "Cache-Control": "no-store" } });
}


import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { canAccessCase, canAssignCase, requiresCriminalAssigneeGroup } from "@/lib/case-access";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isAssignableAttorneyRank } from "@/lib/case-assignees";
import { notify } from "@/lib/notifications";

const assignmentSchema = z.object({
  expectedAssignedAttorneyId: z.string().trim().max(128).nullable(),
  assignedAttorneyId: z.string().trim().max(128).nullable(),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ caseNumber: string }> }) {
  const rawBody = await request.text();
  if (rawBody.length > 4_000) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  const { actor } = authResult;
  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = assignmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide the expected current assignee and the new assignee ID (or null to unassign)." }, { status: 400 });

  const { caseNumber } = await params;
  if (!caseNumber || caseNumber.length > 80) return NextResponse.json({ error: "Invalid case number." }, { status: 400 });
  const caseRecord = await prisma.case.findUnique({
    where: { caseNumber },
    select: { id: true, caseNumber: true, title: true, division: true, divisionGroup: true, assignedAttorneyId: true, createdById: true, isDraft: true },
  });
  if (!caseRecord) return NextResponse.json({ error: "Case not found." }, { status: 404 });
  if (!canAccessCase(actor.tiers, actor.user.id, caseRecord, actor.user.division, actor.user.divisionGroup)) {
    return NextResponse.json({ error: "You cannot access this case." }, { status: 403 });
  }
  const canAssign = canAssignCase(actor.tiers, actor.user.division, caseRecord.division);
  if (!canAssign) return NextResponse.json({ error: "Your current role cannot assign this case." }, { status: 403 });
  if (caseRecord.assignedAttorneyId !== parsed.data.expectedAssignedAttorneyId) {
    return NextResponse.json({ error: "The case assignment changed since it was listed. Refresh the docket and retry.", currentAssignedAttorneyId: caseRecord.assignedAttorneyId }, { status: 409 });
  }

  const hasOfficeWideAssignment = hasCapability(actor.tiers, CAPABILITIES.CASES_ASSIGN);
  let assignee: { id: string; displayName: string; division: string | null; divisionGroup: string | null } | null = null;
  if (parsed.data.assignedAttorneyId) {
    const candidate = await prisma.user.findUnique({
      where: { id: parsed.data.assignedAttorneyId },
      select: { id: true, displayName: true, division: true, divisionGroup: true, robloxUserId: true, discordUserId: true },
    });
    if (!candidate) return NextResponse.json({ error: "The selected attorney is not in the staff directory." }, { status: 400 });
    if (!hasOfficeWideAssignment && candidate.division !== actor.user.division) return NextResponse.json({ error: "You can only assign cases to attorneys in your division." }, { status: 403 });
    if (actor.tiers.includes("senior_assistant_district_attorney") && !hasOfficeWideAssignment && candidate.divisionGroup !== actor.user.divisionGroup) {
      return NextResponse.json({ error: "You can only assign cases to attorneys in your Criminal Division group." }, { status: 403 });
    }
    const identityFilters = [
      ...(candidate.robloxUserId ? [{ robloxUserId: candidate.robloxUserId }] : []),
      ...(candidate.discordUserId ? [{ discordUserId: candidate.discordUserId }] : []),
    ];
    const rosterEntry = identityFilters.length ? await prisma.rosterEntry.findFirst({
      where: { isActive: true, rank: { not: null }, OR: identityFilters },
      select: { rank: true, unit: true, divisionGroup: true },
    }) : null;
    if (!rosterEntry || !isAssignableAttorneyRank(rosterEntry.rank)) return NextResponse.json({ error: "The selected person is not an active attorney in the staff roster." }, { status: 400 });
    if (!hasOfficeWideAssignment && rosterEntry.unit !== actor.user.division) return NextResponse.json({ error: "The selected attorney is not in your division." }, { status: 403 });
    if (actor.tiers.includes("senior_assistant_district_attorney") && !hasOfficeWideAssignment && rosterEntry.divisionGroup !== actor.user.divisionGroup) {
      return NextResponse.json({ error: "You can only assign cases to attorneys in your Criminal Division group." }, { status: 403 });
    }
    assignee = { ...candidate, division: rosterEntry.unit, divisionGroup: rosterEntry.divisionGroup };
    if (requiresCriminalAssigneeGroup(caseRecord.division, canAssign, caseRecord.assignedAttorneyId, assignee.id) && !assignee.divisionGroup && !hasOfficeWideAssignment) {
      return NextResponse.json({ error: "Assign the selected attorney to Criminal Division Group 1 or 2 before assigning this case." }, { status: 400 });
    }
  }

  if (caseRecord.assignedAttorneyId === (assignee?.id ?? null)) {
    return NextResponse.json({ changed: false, case: { caseNumber, title: caseRecord.title, assignedAttorney: assignee } }, { headers: { "Cache-Control": "no-store" } });
  }

  const previous = caseRecord.assignedAttorneyId
    ? await prisma.user.findUnique({ where: { id: caseRecord.assignedAttorneyId }, select: { displayName: true } })
    : null;
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.case.updateMany({
      where: { id: caseRecord.id, assignedAttorneyId: parsed.data.expectedAssignedAttorneyId },
      data: {
        assignedAttorneyId: assignee?.id ?? null,
        divisionGroup: caseRecord.division === "Criminal Division" ? assignee?.divisionGroup ?? caseRecord.divisionGroup : null,
      },
    });
    if (result.count !== 1) return false;
    await tx.caseComment.create({
      data: {
        caseId: caseRecord.id,
        isSystem: true,
        body: `Assignment changed from ${previous?.displayName ?? "Unassigned"} to ${assignee?.displayName ?? "Unassigned"} by ${actor.user.displayName} using local case operations.`,
      },
    });
    return true;
  });
  if (!updated) return NextResponse.json({ error: "The case assignment changed while this request was being processed. Refresh the docket and retry." }, { status: 409 });
  if (assignee && assignee.id !== actor.user.id) {
    try {
      await notify({ userId: assignee.id, type: "case_assigned", title: `You were assigned to ${caseRecord.caseNumber}`, body: caseRecord.title, link: `/dashboard/cases/${caseRecord.id}` });
    } catch (error) {
      console.error(`[local case assignment ${caseRecord.id}] Assignment saved, but notification delivery failed.`, error);
    }
  }

  revalidatePath("/dashboard/cases");
  revalidatePath(`/dashboard/cases/${caseRecord.id}`);
  return NextResponse.json({ changed: true, case: { caseNumber, title: caseRecord.title, assignedAttorney: assignee } }, { headers: { "Cache-Control": "no-store" } });
}

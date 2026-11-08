import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { decryptCrimeTip } from "@/lib/crime-tip-encryption";
import { notify, userIdsWithCapability } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const updateTipSchema = z.object({
  status: z.enum([
    "NEW",
    "UNDER_REVIEW",
    "FOLLOW_UP",
    "REFERRED",
    "NO_JURISDICTION",
    "INSUFFICIENT",
    "DUPLICATE",
    "OPENED_AS_CASE",
    "CLOSED",
  ]).optional(),
  assigneeId: z.string().trim().nullable().optional(),
  linkedCaseId: z.string().trim().nullable().optional(),
  note: z.string().trim().max(1000).optional(),
}).strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateLocalAutomationRequest(request, "");
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }

  const { actor } = authResult;
  if (!hasCapability(actor.tiers, CAPABILITIES.TIPS_REVIEW)) {
    return NextResponse.json({ error: "Forbidden: You lack tips review capability." }, { status: 403 });
  }

  const { id } = await params;
  const tip = await prisma.crimeTip.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, displayName: true, username: true } },
      linkedCase: { select: { id: true, caseNumber: true, title: true, stage: true } },
      attachments: { select: { id: true, fileName: true, mimeType: true, byteSize: true, sha256: true, createdAt: true } },
      events: {
        include: { actor: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!tip) {
    return NextResponse.json({ error: "Tip not found." }, { status: 404 });
  }

  let decrypted: Record<string, unknown> = {};
  try {
    decrypted = decryptCrimeTip(tip.encryptedPayload) as Record<string, unknown>;
  } catch {
    decrypted = { error: "Failed to decrypt payload." };
  }

  return NextResponse.json({
    ok: true,
    tip: {
      id: tip.id,
      reference: tip.reference,
      category: tip.category,
      status: tip.status,
      crimeType: tip.crimeType,
      assignedTo: tip.assignedTo,
      linkedCase: tip.linkedCase,
      details: decrypted,
      attachments: tip.attachments,
      events: tip.events.map((e) => ({
        id: e.id,
        action: e.action,
        note: e.note,
        actor: e.actor?.displayName ?? "System",
        createdAt: e.createdAt.toISOString(),
      })),
      createdAt: tip.createdAt.toISOString(),
      updatedAt: tip.updatedAt.toISOString(),
    },
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawBody = await request.text();
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }

  const { actor } = authResult;
  if (!hasCapability(actor.tiers, CAPABILITIES.TIPS_REVIEW)) {
    return NextResponse.json({ error: "Forbidden: You lack tips review capability." }, { status: 403 });
  }

  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = updateTipSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid tip update fields." }, { status: 400 });

  const { status, assigneeId, linkedCaseId, note } = parsed.data;
  const { id } = await params;

  const tip = await prisma.crimeTip.findUnique({
    where: { id },
    select: { id: true, status: true, assignedToId: true, linkedCaseId: true, reference: true },
  });

  if (!tip) {
    return NextResponse.json({ error: "Tip not found." }, { status: 404 });
  }

  const newStatus = status ?? tip.status;
  const newAssigneeId = assigneeId !== undefined ? assigneeId : tip.assignedToId;
  const newLinkedCaseId = linkedCaseId !== undefined ? linkedCaseId : tip.linkedCaseId;

  if (newStatus === "OPENED_AS_CASE" && !newLinkedCaseId) {
    return NextResponse.json({ error: "Provide a linkedCaseId before setting status to OPENED_AS_CASE, or use the convert endpoint." }, { status: 400 });
  }

  if (newAssigneeId && newAssigneeId !== tip.assignedToId) {
    const reviewers = await userIdsWithCapability(CAPABILITIES.TIPS_REVIEW);
    if (!reviewers.includes(newAssigneeId)) {
      return NextResponse.json({ error: "Assigned user is not an authorized tip reviewer." }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.crimeTip.update({
      where: { id },
      data: {
        status: newStatus,
        assignedToId: newAssigneeId,
        linkedCaseId: newLinkedCaseId,
        updatedAt: new Date(),
      },
    });

    const statusChange = newStatus !== tip.status ? `Status changed from ${tip.status} to ${newStatus}` : "";
    const assignChange = newAssigneeId !== tip.assignedToId ? `Assigned to ${newAssigneeId ?? "unassigned"}` : "";
    const caseChange = newLinkedCaseId !== tip.linkedCaseId ? `Linked to case ${newLinkedCaseId ?? "none"}` : "";
    const actionDesc = [statusChange, assignChange, caseChange].filter(Boolean).join("; ") || "Tip updated";

    await tx.crimeTipEvent.create({
      data: {
        tipId: id,
        actorId: actor.user.id,
        action: actionDesc,
        note: note || null,
      },
    });
  });

  if (newAssigneeId && newAssigneeId !== actor.user.id && newAssigneeId !== tip.assignedToId) {
    try {
      await notify({
        userId: newAssigneeId,
        type: "crime_tip",
        title: "A crime tip was assigned to you",
        body: `Tip ${tip.reference} was assigned by ${actor.user.displayName}`,
        link: "/dashboard/review?type=tip",
      });
    } catch {}
  }

  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/work-queue");

  return NextResponse.json({
    ok: true,
    tipId: id,
    reference: tip.reference,
    status: newStatus,
    assignedToId: newAssigneeId,
    linkedCaseId: newLinkedCaseId,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { canReviewDivision } from "@/lib/case-access";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { DEVELOPER_PROFILE_TIER } from "@/lib/permissions/tiers";
import { notify } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";

const reviewSchema = z.object({
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  note: z.string().trim().max(1000).optional().default(""),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawBody = await request.text();
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }

  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a valid decision (ACCEPTED or REJECTED)." }, { status: 400 });

  const { decision, note } = parsed.data;
  if (decision === "REJECTED" && !note) {
    return NextResponse.json({ error: "Provide a reason when rejecting an AOPC or investigative report." }, { status: 400 });
  }

  const { actor } = authResult;
  if (!hasCapability(actor.tiers, CAPABILITIES.CASES_APPROVE_EDITS) && !hasCapability(actor.tiers, CAPABILITIES.CASES_APPROVE_DIVISION)) {
    return NextResponse.json({ error: "Forbidden: You lack review authority." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.aopc.findUnique({
    where: { id },
    select: {
      id: true,
      reportId: true,
      title: true,
      subject: true,
      documentType: true,
      targetUnit: true,
      submittedById: true,
      intakeTicketId: true,
      status: true,
      linkedCaseId: true,
    },
  });

  if (!existing || existing.intakeTicketId) {
    return NextResponse.json({ error: "AOPC or investigative report not found." }, { status: 404 });
  }

  const mayReviewOwn = actor.tiers.includes(DEVELOPER_PROFILE_TIER)
    || actor.tiers.includes("chief_assistant_district_attorney")
    || actor.tiers.includes("district_attorney");

  const canReview = canReviewDivision(
    actor.tiers,
    actor.user.division,
    existing.targetUnit,
    actor.user.divisionGroup,
    existing.targetUnit === "Criminal Division" ? actor.user.divisionGroup : null
  );

  if (!canReview || (existing.submittedById === actor.user.id && !mayReviewOwn)) {
    return NextResponse.json({ error: "This AOPC is outside your review authority." }, { status: 403 });
  }

  const reviewedAt = new Date();
  const result = await prisma.aopc.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: decision,
      reviewedById: actor.user.id,
      reviewedAt,
      reviewNote: note || null,
    },
  });

  if (!result.count) {
    return NextResponse.json({ error: "This AOPC has already been reviewed." }, { status: 409 });
  }

  if (existing.linkedCaseId) {
    await prisma.caseComment.create({
      data: {
        caseId: existing.linkedCaseId,
        body: `${existing.documentType === "AOPC" ? "AOPC" : "Investigative report"} “${existing.reportId || existing.title}” ${decision === "ACCEPTED" ? "approved" : "returned"} by ${actor.user.displayName}.${note ? ` Review note: ${note}` : ""}`,
        isSystem: true,
      },
    });
  }

  await logActivity(
    actor.user.displayName,
    `${decision === "ACCEPTED" ? "Approved" : "Returned"} ${existing.documentType || "AOPC"}`,
    "Case",
    `${existing.reportId || existing.title} · ${existing.subject}`
  );

  try {
    await notify({
      userId: existing.submittedById,
      type: "aopc_reviewed",
      title: `AOPC ${existing.reportId || existing.title} ${decision === "ACCEPTED" ? "accepted" : "returned"}`,
      body: note || "Your submission was accepted.",
      link: existing.linkedCaseId ? `/dashboard/cases/${existing.linkedCaseId}` : "/dashboard/cases",
    });
  } catch (error) {
    console.error(`[aopc review ${id}] Notification failed`, error);
  }

  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/affidavits");
  if (existing.linkedCaseId) {
    revalidatePath(`/dashboard/cases/${existing.linkedCaseId}`);
  }

  return NextResponse.json({
    ok: true,
    aopcId: id,
    reportId: existing.reportId,
    title: existing.title,
    decision,
    status: decision,
    reviewedAt: reviewedAt.toISOString(),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

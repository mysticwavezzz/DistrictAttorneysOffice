import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { canReviewDivision } from "@/lib/case-access";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { DEVELOPER_PROFILE_TIER } from "@/lib/permissions/tiers";
import { notify } from "@/lib/notifications";
import { indexAcceptedCaseFiling } from "@/lib/filing-text-index";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";

const reviewSchema = z.object({
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  note: z.string().trim().max(1000).optional().default(""),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseNumber: string; id: string }> }
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
    return NextResponse.json({ error: "Provide a reason when rejecting a filing." }, { status: 400 });
  }

  const { actor } = authResult;
  if (!hasCapability(actor.tiers, CAPABILITIES.CASES_APPROVE_EDITS) && !hasCapability(actor.tiers, CAPABILITIES.CASES_APPROVE_DIVISION)) {
    return NextResponse.json({ error: "Forbidden: You lack review authority." }, { status: 403 });
  }

  const { caseNumber, id } = await params;
  const filing = await prisma.caseFiling.findUnique({
    where: { id },
    include: {
      case: {
        include: {
          assignedAttorney: { select: { divisionGroup: true } },
          createdBy: { select: { divisionGroup: true } },
        },
      },
    },
  });

  if (!filing || filing.case.caseNumber !== caseNumber) {
    return NextResponse.json({ error: "Filing not found for this case." }, { status: 404 });
  }

  const mayReviewOwnFiling = actor.tiers.includes(DEVELOPER_PROFILE_TIER)
    || actor.tiers.includes("chief_assistant_district_attorney")
    || actor.tiers.includes("district_attorney");
  const filingGroup = filing.case.divisionGroup ?? filing.case.assignedAttorney?.divisionGroup ?? filing.case.createdBy.divisionGroup;
  if (!canReviewDivision(actor.tiers, actor.user.division, filing.case.division, actor.user.divisionGroup, filingGroup) || (filing.addedById === actor.user.id && !mayReviewOwnFiling)) {
    return NextResponse.json({ error: "This filing is outside your review authority." }, { status: 403 });
  }

  const reviewedAt = new Date();
  const claimed = await prisma.$transaction(async (tx) => {
    const updated = await tx.caseFiling.updateMany({
      where: { id, status: "PENDING" },
      data: { status: decision, reviewedById: actor.user.id, reviewedAt, reviewNote: note || null },
    });
    if (!updated.count) return false;
    await tx.case.update({ where: { id: filing.caseId }, data: { updatedAt: reviewedAt } });
    await tx.caseComment.create({
      data: {
        caseId: filing.caseId,
        body: filing.isInitial && decision === "ACCEPTED"
          ? `Initial complaint approved in the portal for court filing by ${actor.user.displayName} via local automation.${note ? ` Review note: ${note}` : ""}`
          : `Filing “${filing.title}” ${decision === "ACCEPTED" ? "approved" : "returned"} by ${actor.user.displayName} via local automation.${note ? ` Review note: ${note}` : ""}`,
        isSystem: true,
      },
    });
    return true;
  });

  if (!claimed) {
    return NextResponse.json({ error: "This filing has already been reviewed or is not pending." }, { status: 409 });
  }

  if (decision === "ACCEPTED" && filing.pdfData) {
    after(async () => {
      try { await indexAcceptedCaseFiling(filing.id); }
      catch (error) { console.error(`[filing text index ${filing.id}] Search indexing failed`, error); }
    });
  }

  await logActivity(actor.user.displayName, `${decision === "ACCEPTED" ? "Approved" : "Returned"} filing`, "Case", `${filing.case.caseNumber} · ${filing.title}`);

  try {
    await notify({
      userId: filing.addedById,
      type: "case_filing_review",
      title: decision === "ACCEPTED" ? "Your filing was approved" : "Your filing was returned",
      body: `${filing.case.caseNumber} · ${note || filing.title}`,
      link: `/dashboard/cases/${filing.caseId}#filings`,
    });
    if (decision === "ACCEPTED" && filing.case.assignedAttorneyId && filing.case.assignedAttorneyId !== filing.addedById) {
      await notify({
        userId: filing.case.assignedAttorneyId,
        type: "case_filing",
        title: `New filing on ${filing.case.caseNumber}`,
        body: filing.title,
        link: `/dashboard/cases/${filing.caseId}#filings`,
      });
    }
  } catch (error) {
    console.error(`[filing review ${filing.id}] Decision saved, but notification delivery failed`, error);
  }

  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/filings");
  revalidatePath(`/dashboard/cases/${filing.caseId}`);

  return NextResponse.json({
    recorded: true,
    caseNumber,
    filingId: filing.id,
    title: filing.title,
    status: decision,
    reviewedAt: reviewedAt.toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}

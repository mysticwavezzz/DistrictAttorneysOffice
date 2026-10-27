import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { canAccessCase, canEditCase } from "@/lib/case-access";
import { shouldRequireFilingApproval } from "@/lib/filing-approval";
import { MAX_CASE_PDF_BYTES, validateCasePdf } from "@/lib/filing-upload";
import { CAPABILITIES } from "@/lib/permissions";
import { notify, notifyMany, userIdsWithCapability } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const MAX_REQUEST_BYTES = 7_100_000;
const uploadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  pdfFileName: z.string().trim().min(1).max(180),
  pdfBase64: z.string().min(24).max(Math.ceil(MAX_CASE_PDF_BYTES / 3) * 4),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ caseNumber: string }> }) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }

  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a document title, PDF filename, and PDF bytes." }, { status: 400 });

  const { caseNumber } = await params;
  if (!caseNumber || caseNumber.length > 80) return NextResponse.json({ error: "Invalid case number." }, { status: 400 });
  const caseRecord = await prisma.case.findUnique({
    where: { caseNumber },
    select: { id: true, caseNumber: true, title: true, division: true, divisionGroup: true, assignedAttorneyId: true, createdById: true, isDraft: true, archived: true },
  });
  if (!caseRecord) return NextResponse.json({ error: "Case not found." }, { status: 404 });
  const { actor } = authResult;
  if (!canAccessCase(actor.tiers, actor.user.id, caseRecord, actor.user.division, actor.user.divisionGroup)
    || !canEditCase(actor.tiers, actor.user.division, caseRecord.division)) {
    return NextResponse.json({ error: "You cannot submit a filing to this case." }, { status: 403 });
  }
  if (caseRecord.isDraft || caseRecord.archived) {
    return NextResponse.json({ error: "Local document operations can only submit filings to active cases." }, { status: 409 });
  }

  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(parsed.data.pdfBase64)) {
    return NextResponse.json({ error: "PDF encoding is invalid." }, { status: 400 });
  }
  const pdfBytes = Buffer.from(parsed.data.pdfBase64, "base64");
  if (pdfBytes.toString("base64") !== parsed.data.pdfBase64) {
    return NextResponse.json({ error: "PDF encoding is invalid." }, { status: 400 });
  }
  const pdfError = validateCasePdf(new Uint8Array(pdfBytes));
  if (pdfError) return NextResponse.json({ error: pdfError }, { status: 400 });

  const pdfFileName = parsed.data.pdfFileName.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "document.pdf";
  const duplicate = await prisma.caseFiling.findFirst({
    where: {
      caseId: caseRecord.id,
      title: parsed.data.title,
      addedById: actor.user.id,
      pdfData: pdfBytes.toString("base64"),
      status: { in: ["PENDING", "ACCEPTED"] },
    },
    select: { id: true, title: true, status: true },
  });
  if (duplicate) {
    return NextResponse.json({
      filingId: duplicate.id,
      title: duplicate.title,
      caseNumber: caseRecord.caseNumber,
      caseTitle: caseRecord.title,
      status: duplicate.status,
      alreadySubmitted: true,
      caseUrl: `/dashboard/cases/${caseRecord.id}#filings`,
      reviewUrl: duplicate.status === "PENDING" ? "/dashboard/review?type=filing" : null,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const submittedAt = new Date();
  const requiresApproval = shouldRequireFilingApproval(actor.tiers, actor.user.division);
  const filing = await prisma.$transaction(async (tx) => {
    const created = await tx.caseFiling.create({
      data: {
        caseId: caseRecord.id,
        title: parsed.data.title,
        url: null,
        pdfData: pdfBytes.toString("base64"),
        pdfFileName,
        addedById: actor.user.id,
        status: requiresApproval ? "PENDING" : "ACCEPTED",
        reviewedById: requiresApproval ? null : actor.user.id,
        reviewedAt: requiresApproval ? null : submittedAt,
        submittedAt,
      },
      select: { id: true, title: true, status: true },
    });
    await tx.caseComment.create({
      data: {
        caseId: caseRecord.id,
        isSystem: true,
        body: `Filing “${parsed.data.title}” submitted by ${actor.user.displayName} using local document operations${requiresApproval ? " and is pending review" : ""}.`,
      },
    });
    await tx.case.update({ where: { id: caseRecord.id }, data: { updatedAt: submittedAt } });
    return created;
  });

  if (requiresApproval) {
    try {
      const [officeReviewerIds, divisionReviewerIds] = await Promise.all([
        userIdsWithCapability(CAPABILITIES.CASES_APPROVE_EDITS),
        userIdsWithCapability(CAPABILITIES.CASES_APPROVE_DIVISION),
      ]);
      const divisionReviewers = caseRecord.division
        ? await prisma.user.findMany({
          where: {
            id: { in: divisionReviewerIds },
            division: caseRecord.division,
            ...(caseRecord.division === "Criminal Division"
              ? { OR: [{ divisionGroup: caseRecord.divisionGroup }, { tiers: { contains: "chief_assistant_district_attorney" } }] }
              : {}),
          },
          select: { id: true },
        })
        : [];
      const reviewerIds = Array.from(new Set([...officeReviewerIds, ...divisionReviewers.map((reviewer) => reviewer.id)]));
      await notifyMany(reviewerIds.filter((id) => id !== actor.user.id), {
        type: "case_filing_review",
        title: `Filing needs review on ${caseRecord.caseNumber}`,
        body: parsed.data.title,
        link: "/dashboard/review?type=filing",
      });
      await notify({
        userId: actor.user.id,
        type: "case_filing_review",
        title: "Filing submitted for approval",
        body: `${parsed.data.title} · ${caseRecord.caseNumber}`,
        link: `/dashboard/cases/${caseRecord.id}#filings`,
      });
    } catch (error) {
      console.error(`[local document filing ${filing.id}] Filing was saved, but review notification delivery failed.`, error);
    }
  }

  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/filings");
  revalidatePath(`/dashboard/cases/${caseRecord.id}`);
  return NextResponse.json({
    filingId: filing.id,
    title: filing.title,
    caseNumber: caseRecord.caseNumber,
    caseTitle: caseRecord.title,
    status: filing.status,
    caseUrl: `/dashboard/cases/${caseRecord.id}#filings`,
    reviewUrl: requiresApproval ? "/dashboard/review?type=filing" : null,
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

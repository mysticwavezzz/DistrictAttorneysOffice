"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { canReviewDivision, localUser } from "@/lib/case-access";
import { DEVELOPER_PROFILE_TIER } from "@/lib/permissions/tiers";
import { decodeCasePdf } from "@/lib/filing-upload";
import { extractFilingPdfText, FilingPdfTextError } from "@/lib/ai-filing-review/pdf-text";
import { DEFAULT_GROQ_REVIEW_MODEL, FilingAiReviewError, runFilingAiReview } from "@/lib/ai-filing-review/review";
import { FILING_REVIEW_PROMPT_VERSION } from "@/lib/ai-filing-review/review";
import { FILING_REVIEW_SOURCE_VERSION } from "@/lib/ai-filing-review/authorities";
import { runWithActionDebug } from "@/lib/action-debug";

const STALE_REVIEW_MS = 5 * 60_000;

async function runAiFilingReviewImpl(formData: FormData) {
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION))) throw new Error("Forbidden");
  const user = await localUser(session.user);
  if (!user) throw new Error("Forbidden");

  const id = String(formData.get("id") ?? "").trim();
  if (!id || id.length > 64) throw new Error("Choose a pending filing to review.");

  const filing = await prisma.caseFiling.findUnique({
    where: { id },
    include: { case: { include: { assignedAttorney: { select: { divisionGroup: true } }, createdBy: { select: { divisionGroup: true } } } } },
  });
  const isDeveloper = session.user.tiers.includes(DEVELOPER_PROFILE_TIER);
  const filingGroup = filing ? filing.case.divisionGroup ?? filing.case.assignedAttorney?.divisionGroup ?? filing.case.createdBy.divisionGroup : null;
  if (!filing || filing.status !== "PENDING" || !canReviewDivision(session.user.tiers, user.division, filing.case.division, user.divisionGroup, filingGroup) || (filing.addedById === user.id && !isDeveloper)) {
    throw new Error("This filing is outside your review authority or is no longer pending.");
  }
  if (!filing.pdfData) throw new Error("This filing has no attached PDF to pre-screen.");

  const now = Date.now();
  await prisma.filingAiReview.updateMany({
    where: { filingId: id, activeFilingId: id, status: "RUNNING", createdAt: { lt: new Date(now - STALE_REVIEW_MS) } },
    data: { status: "FAILED", activeFilingId: null, failureCode: "REVIEW_TIMED_OUT", completedAt: new Date(now) },
  });
  const recentRun = await prisma.filingAiReview.findFirst({
    where: { filingId: id, status: "RUNNING", createdAt: { gte: new Date(now - STALE_REVIEW_MS) } },
    select: { id: true },
  });
  if (recentRun) throw new Error("An AI pre-screen is already running for this filing.");

  const pdfBytes = decodeCasePdf(filing.pdfData);
  const documentSha256 = createHash("sha256").update(pdfBytes).digest("hex");
  const modelId = process.env.GROQ_MODEL || DEFAULT_GROQ_REVIEW_MODEL;
  let run: { id: string };
  try {
    run = await prisma.filingAiReview.create({
      data: {
        filingId: id,
        activeFilingId: id,
        requestedById: user.id,
        status: "RUNNING",
        modelId,
        promptVersion: FILING_REVIEW_PROMPT_VERSION,
        sourceBundleVersion: FILING_REVIEW_SOURCE_VERSION,
        documentSha256,
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("An AI pre-screen is already running for this filing.");
    }
    throw error;
  }

  try {
    const extraction = await extractFilingPdfText(pdfBytes);
    const result = await runFilingAiReview({ pages: extraction.pages, modelId });
    await prisma.filingAiReview.update({
      where: { id: run.id },
      data: { status: "COMPLETED", activeFilingId: null, resultJson: JSON.stringify(result), completedAt: new Date() },
    });
  } catch (error) {
    const failureCode = error instanceof FilingPdfTextError || error instanceof FilingAiReviewError
      ? error.code
      : "MODEL_UNAVAILABLE";
    console.error(`[AI filing review ${run.id}] ${failureCode}`);
    await prisma.filingAiReview.update({ where: { id: run.id }, data: { status: "FAILED", activeFilingId: null, failureCode, completedAt: new Date() } });
  }

  revalidatePath("/dashboard/review");
}

export async function runAiFilingReview(formData: FormData) {
  return runWithActionDebug("runAiFilingReview", [formData], () => runAiFilingReviewImpl(formData));
}

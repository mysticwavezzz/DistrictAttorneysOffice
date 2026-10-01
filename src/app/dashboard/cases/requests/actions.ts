"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { caseInputSchema, emptyToNull, toDate } from "@/lib/validation/case";
import { localUser, generateCaseNumber } from "@/lib/case-access";
import { notify, notifyMany, userIdsWithCapability } from "@/lib/notifications";

async function requireProposer() {
  const session = await auth();
  if (!session?.user?.providerUserId || !hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT)) {
    throw new Error("Forbidden");
  }
  const user = await localUser(session.user);
  if (!user) throw new Error("Local staff record not found");
  return { session, user };
}

async function requireReviewer() {
  const session = await auth();
  if (!session?.user?.providerUserId || !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS)) {
    throw new Error("Forbidden");
  }
  const user = await localUser(session.user);
  if (!user) throw new Error("Local staff record not found");
  return { session, user };
}

export async function submitCaseRequest(formData: FormData) {
  const { user } = await requireProposer();

  const parsed = caseInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid case data");

  const caseId = emptyToNull(String(formData.get("caseId") ?? ""));
  const kind = caseId ? "EDIT" : "CREATE";

  await prisma.caseActionRequest.create({
    data: {
      kind,
      caseId,
      proposedData: JSON.stringify(parsed.data),
      requestedById: user.id,
    },
  });

  const reviewerIds = await userIdsWithCapability(CAPABILITIES.CASES_APPROVE_EDITS);
  await notifyMany(
    reviewerIds.filter((id) => id !== user.id),
    {
      type: "case_request",
      title: `${kind === "CREATE" ? "New case" : "Case edit"} needs review`,
      body: parsed.data.title,
      link: `/dashboard/cases/requests`,
    }
  );

  revalidatePath("/dashboard/cases/requests");
  redirect("/dashboard/cases");
}

export async function reviewCaseRequest(formData: FormData) {
  const { session, user } = await requireReviewer();

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 1000);
  if (!id || (decision !== "APPROVE" && decision !== "REJECT")) {
    throw new Error("Invalid review submission");
  }
  if (decision === "REJECT" && !note.trim()) throw new Error("A review note is required when rejecting a request");

  const request = await prisma.caseActionRequest.findUnique({ where: { id } });
  if (!request || request.status !== "PENDING") {
    throw new Error("Request not found or already reviewed");
  }

  let createdCaseId: string | null = null;
  let reviewAppliedInTransaction = false;
  if (decision === "APPROVE") {
    const data = JSON.parse(request.proposedData) as Record<string, unknown>;

    if (request.kind === "CREATE") {
      const parsed = caseInputSchema.safeParse(data);
      if (!parsed.success) throw new Error("The submitted case data is invalid and cannot be approved.");
      const caseData = parsed.data;
      const parties = typeof data.partyDetails === "string" ? data.partyDetails : "[]";
      const assignedAttorneyId = typeof data.assignedAttorneyId === "string" ? data.assignedAttorneyId : request.requestedById;
      const filing = data.initialFiling && typeof data.initialFiling === "object"
        ? data.initialFiling as { title?: string; url?: string | null; pdfData?: string; pdfFileName?: string }
        : null;
      const caseNumber = emptyToNull(caseData.caseNumber) ?? (await generateCaseNumber());
      const created = await prisma.$transaction(async (tx) => {
        const claimed = await tx.caseActionRequest.updateMany({
          where: { id, status: "PENDING" },
          data: { status: "APPROVED", reviewedById: user.id, reviewNote: note || null, reviewedAt: new Date() },
        });
        if (!claimed.count) throw new Error("Request has already been reviewed.");
        const caseRecord = await tx.case.create({
          data: {
            title: caseData.title,
            caseNumber,
            type: emptyToNull(caseData.type),
            stage: emptyToNull(caseData.stage),
            assignedJudge: emptyToNull(caseData.assignedJudge),
            partyDetails: parties,
            disclosures: emptyToNull(caseData.disclosures),
            discGiven: toDate(caseData.discGiven),
            discDue: toDate(caseData.discDue),
            pretrial: toDate(caseData.pretrial),
            otherDates: emptyToNull(caseData.otherDates),
            outcome: emptyToNull(caseData.outcome),
            closedOn: toDate(caseData.closedOn),
            appealBy: toDate(caseData.appealBy),
            arraignmentAt: toDate(caseData.arraignmentAt),
            proofOfServiceAt: toDate(caseData.proofOfServiceAt),
            discoveryOrderAt: toDate(caseData.discoveryOrderAt),
            discoveryRequestedAt: toDate(caseData.discoveryRequestedAt),
            motionServedAt: toDate(caseData.motionServedAt),
            verdictAt: toDate(caseData.verdictAt),
            sentenceAt: toDate(caseData.sentenceAt),
            finalJudgmentAt: toDate(caseData.finalJudgmentAt),
            summary: emptyToNull(caseData.summary) ?? "",
            assignedAttorneyId,
            createdById: request.requestedById,
          },
        });
        if (filing?.title && (filing.url || filing.pdfData)) {
          await tx.caseFiling.create({
            data: { caseId: caseRecord.id, title: filing.title, url: filing.url ?? null, pdfData: filing.pdfData ?? null, pdfFileName: filing.pdfFileName ?? null, addedById: request.requestedById },
          });
        }
        return caseRecord;
      });
      createdCaseId = created.id;
    } else if (request.caseId) {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.caseActionRequest.updateMany({
          where: { id, status: "PENDING" },
          data: { status: "APPROVED", reviewedById: user.id, reviewNote: note || null, reviewedAt: new Date() },
        });
        if (!claimed.count) throw new Error("Request has already been reviewed.");
        await tx.case.update({
          where: { id: request.caseId! },
          data: {
          title: typeof data.title === "string" ? data.title : undefined,
          caseNumber: typeof data.caseNumber === "string" ? data.caseNumber : undefined,
          type: emptyToNull(typeof data.type === "string" ? data.type : undefined),
          stage: emptyToNull(typeof data.stage === "string" ? data.stage : undefined),
          disclosures: emptyToNull(typeof data.disclosures === "string" ? data.disclosures : undefined),
          discGiven: toDate(typeof data.discGiven === "string" ? data.discGiven : undefined),
          discDue: toDate(typeof data.discDue === "string" ? data.discDue : undefined),
          pretrial: toDate(typeof data.pretrial === "string" ? data.pretrial : undefined),
          otherDates: emptyToNull(typeof data.otherDates === "string" ? data.otherDates : undefined),
          outcome: emptyToNull(typeof data.outcome === "string" ? data.outcome : undefined),
          closedOn: toDate(typeof data.closedOn === "string" ? data.closedOn : undefined),
          appealBy: toDate(typeof data.appealBy === "string" ? data.appealBy : undefined),
          arraignmentAt: toDate(typeof data.arraignmentAt === "string" ? data.arraignmentAt : undefined),
          proofOfServiceAt: toDate(typeof data.proofOfServiceAt === "string" ? data.proofOfServiceAt : undefined),
          discoveryOrderAt: toDate(typeof data.discoveryOrderAt === "string" ? data.discoveryOrderAt : undefined),
          discoveryRequestedAt: toDate(typeof data.discoveryRequestedAt === "string" ? data.discoveryRequestedAt : undefined),
          motionServedAt: toDate(typeof data.motionServedAt === "string" ? data.motionServedAt : undefined),
          verdictAt: toDate(typeof data.verdictAt === "string" ? data.verdictAt : undefined),
          sentenceAt: toDate(typeof data.sentenceAt === "string" ? data.sentenceAt : undefined),
          finalJudgmentAt: toDate(typeof data.finalJudgmentAt === "string" ? data.finalJudgmentAt : undefined),
          summary: emptyToNull(typeof data.summary === "string" ? data.summary : undefined) ?? "",
          assignedJudge: emptyToNull(typeof data.assignedJudge === "string" ? data.assignedJudge : undefined),
          },
        });
        await tx.caseComment.create({
          data: {
            caseId: request.caseId!,
            body: `Proposed case edit approved by ${session.user.displayName}.`,
            isSystem: true,
          },
        });
      });
      reviewAppliedInTransaction = true;
    }
  }

  if (!createdCaseId && !reviewAppliedInTransaction) {
    const result = await prisma.caseActionRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        reviewedById: user.id,
        reviewNote: note || null,
        reviewedAt: new Date(),
      },
    });
    if (!result.count) throw new Error("Request has already been reviewed. Refresh the queue.");
  }

  await notify({
    userId: request.requestedById,
    type: "case_request_reviewed",
    title:
      decision === "APPROVE"
        ? "Your proposed case change was approved"
        : "Your proposed case change was rejected",
    body: note || undefined,
    link: decision === "REJECT" && request.kind === "CREATE"
      ? `/dashboard/cases/new?reviseRequestId=${encodeURIComponent(request.id)}`
      : createdCaseId ? `/dashboard/cases/${createdCaseId}` : request.caseId ? `/dashboard/cases/${request.caseId}` : "/dashboard/cases",
  });

  revalidatePath("/dashboard/cases/requests");
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/filings");
  if (request.caseId) revalidatePath(`/dashboard/cases/${request.caseId}`);
  if (createdCaseId) revalidatePath(`/dashboard/cases/${createdCaseId}`);
}

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
  if (!session?.user?.discordUserId || !hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT)) {
    throw new Error("Forbidden");
  }
  const user = await localUser(session.user.discordUserId);
  if (!user) throw new Error("Local staff record not found");
  return { session, user };
}

async function requireReviewer() {
  const session = await auth();
  if (!session?.user?.discordUserId || !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS)) {
    throw new Error("Forbidden");
  }
  const user = await localUser(session.user.discordUserId);
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

  const request = await prisma.caseActionRequest.findUnique({ where: { id } });
  if (!request || request.status !== "PENDING") {
    throw new Error("Request not found or already reviewed");
  }

  if (decision === "APPROVE") {
    const data = JSON.parse(request.proposedData) as Record<string, string | undefined>;

    if (request.kind === "CREATE") {
      const caseNumber = emptyToNull(data.caseNumber) ?? (await generateCaseNumber());
      await prisma.case.create({
        data: {
          title: data.title ?? "",
          caseNumber,
          type: emptyToNull(data.type),
          stage: emptyToNull(data.stage),
          disclosures: emptyToNull(data.disclosures),
          discGiven: toDate(data.discGiven),
          discDue: toDate(data.discDue),
          pretrial: toDate(data.pretrial),
          otherDates: emptyToNull(data.otherDates),
          outcome: emptyToNull(data.outcome),
          closedOn: toDate(data.closedOn),
          appealBy: toDate(data.appealBy),
          summary: emptyToNull(data.summary) ?? "",
          assignedAttorneyId: emptyToNull(data.assignedAttorneyId),
          createdById: request.requestedById,
        },
      });
    } else if (request.caseId) {
      await prisma.case.update({
        where: { id: request.caseId },
        data: {
          title: data.title ?? undefined,
          caseNumber: data.caseNumber ?? undefined,
          type: emptyToNull(data.type),
          stage: emptyToNull(data.stage),
          disclosures: emptyToNull(data.disclosures),
          discGiven: toDate(data.discGiven),
          discDue: toDate(data.discDue),
          pretrial: toDate(data.pretrial),
          otherDates: emptyToNull(data.otherDates),
          outcome: emptyToNull(data.outcome),
          closedOn: toDate(data.closedOn),
          appealBy: toDate(data.appealBy),
          summary: emptyToNull(data.summary) ?? "",
        },
      });
      await prisma.caseComment.create({
        data: {
          caseId: request.caseId,
          body: `Paralegal-proposed edit approved by ${session.user.displayName}.`,
          isSystem: true,
        },
      });
    }
  }

  await prisma.caseActionRequest.update({
    where: { id },
    data: {
      status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      reviewedById: user.id,
      reviewNote: note || null,
      reviewedAt: new Date(),
    },
  });

  await notify({
    userId: request.requestedById,
    type: "case_request_reviewed",
    title:
      decision === "APPROVE"
        ? "Your proposed case change was approved"
        : "Your proposed case change was rejected",
    body: note || undefined,
    link: request.caseId ? `/dashboard/cases/${request.caseId}` : "/dashboard/cases",
  });

  revalidatePath("/dashboard/cases/requests");
  revalidatePath("/dashboard/cases");
  if (request.caseId) revalidatePath(`/dashboard/cases/${request.caseId}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser, canReviewDivision } from "@/lib/case-access";
import { notify } from "@/lib/notifications";
import { runWithActionDebug } from "@/lib/action-debug";
import { DEVELOPER_PROFILE_TIER } from "@/lib/permissions/tiers";

async function reviewAopcImpl(formData: FormData) {
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION))) throw new Error("Forbidden");
  const user = await localUser(session.user);
  if (!user) throw new Error("Forbidden");
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (!id || !["ACCEPTED", "REJECTED"].includes(decision) || (decision === "REJECTED" && !note)) throw new Error("Choose a decision and provide a reason when rejecting.");

  const existing = await prisma.aopc.findUnique({ where: { id }, select: { targetUnit: true, submittedById: true } });
  if (!existing || !canReviewDivision(session.user.tiers, user.division, existing.targetUnit) || existing.submittedById === user.id) throw new Error("This AOPC is outside your review authority.");

  const result = await prisma.aopc.updateMany({
    where: { id, status: "PENDING" },
    data: { status: decision, reviewedById: user.id, reviewedAt: new Date(), reviewNote: note || null },
  });
  if (!result.count) throw new Error("This AOPC has already been reviewed. Refresh the queue.");
  const item = await prisma.aopc.findUnique({ where: { id }, select: { reportId: true, title: true, submittedById: true } });
  if (item) await notify({
    userId: item.submittedById,
    type: "aopc_reviewed",
    title: `AOPC ${item.reportId || item.title} ${decision === "ACCEPTED" ? "accepted" : "returned"}`,
    body: note || "Your submission was accepted.",
    link: "/dashboard/cases",
  });
  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/affidavits");
}

export async function reviewAopc(formData: FormData) { return runWithActionDebug("reviewAopc", [formData], () => reviewAopcImpl(formData)); }

async function reviewFilingImpl(formData: FormData) {
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION))) throw new Error("Forbidden");
  const user = await localUser(session.user);
  if (!user) throw new Error("Forbidden");
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (!id || !["ACCEPTED", "REJECTED"].includes(decision) || (decision === "REJECTED" && !note)) throw new Error("Choose a decision and provide a reason when rejecting.");

  const filing = await prisma.caseFiling.findUnique({ where: { id }, include: { case: true } });
  const isDeveloper = session.user.tiers.includes(DEVELOPER_PROFILE_TIER);
  if (!filing || !canReviewDivision(session.user.tiers, user.division, filing.case.division) || (filing.addedById === user.id && !isDeveloper)) throw new Error("This filing is outside your review authority.");

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.caseFiling.updateMany({
      where: { id, status: "PENDING" },
      data: { status: decision, reviewedById: user.id, reviewedAt: new Date(), reviewNote: note || null },
    });
    if (!claimed.count) throw new Error("This filing has already been reviewed. Refresh the queue.");
    await tx.case.update({ where: { id: filing.caseId }, data: { ...(decision === "ACCEPTED" && filing.isInitial ? { courtFiledAt: new Date() } : {}), updatedAt: new Date() } });
    await tx.caseComment.create({ data: {
      caseId: filing.caseId,
      body: filing.isInitial && decision === "ACCEPTED"
        ? `Initial complaint approved and case filed with the court by ${session.user.displayName}.${note ? ` Review note: ${note}` : ""}`
        : `Filing “${filing.title}” ${decision === "ACCEPTED" ? "approved" : "returned"} by ${session.user.displayName}.${note ? ` Review note: ${note}` : ""}`,
      isSystem: true,
    } });
  });

  try {
    await notify({ userId: filing.addedById, type: "case_filing_review", title: decision === "ACCEPTED" ? "Your filing was approved" : "Your filing was returned", body: `${filing.case.caseNumber} · ${note || filing.title}`, link: `/dashboard/cases/${filing.caseId}#filings` });
    if (decision === "ACCEPTED" && filing.case.assignedAttorneyId && filing.case.assignedAttorneyId !== filing.addedById) {
      await notify({ userId: filing.case.assignedAttorneyId, type: "case_filing", title: `New filing on ${filing.case.caseNumber}`, body: filing.title, link: `/dashboard/cases/${filing.caseId}#filings` });
    }
  } catch (error) {
    console.error(`[filing review ${filing.id}] Decision saved, but notification delivery failed`, error);
  }

  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/filings");
  revalidatePath(`/dashboard/cases/${filing.caseId}`);
}

export async function reviewFiling(formData: FormData) { return runWithActionDebug("reviewFiling", [formData], () => reviewFilingImpl(formData)); }

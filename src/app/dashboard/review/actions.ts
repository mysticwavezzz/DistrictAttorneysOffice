"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser, canReviewDivision, canAccessCase } from "@/lib/case-access";
import { notify } from "@/lib/notifications";
import { runWithActionDebug } from "@/lib/action-debug";
import { DEVELOPER_PROFILE_TIER } from "@/lib/permissions/tiers";
import { after } from "next/server";
import { indexAcceptedCaseFiling } from "@/lib/filing-text-index";
import { userIdsWithCapability } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

async function reviewAopcImpl(formData: FormData) {
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION))) throw new Error("Forbidden");
  const user = await localUser(session.user);
  if (!user) throw new Error("Forbidden");
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (!id || !["ACCEPTED", "REJECTED"].includes(decision) || (decision === "REJECTED" && !note)) throw new Error("Choose a decision and provide a reason when rejecting.");

  const existing = await prisma.aopc.findUnique({ where: { id }, select: { targetUnit: true, submittedById: true, intakeTicketId: true } });
  if (!existing || existing.intakeTicketId || !canReviewDivision(session.user.tiers, user.division, existing.targetUnit, user.divisionGroup, existing.targetUnit === "Criminal Division" ? user.divisionGroup : null) || existing.submittedById === user.id) throw new Error("This AOPC is outside your review authority.");

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

  const filing = await prisma.caseFiling.findUnique({ where: { id }, include: { case: { include: { assignedAttorney: { select: { divisionGroup: true } }, createdBy: { select: { divisionGroup: true } } } } } });
  const mayReviewOwnFiling = session.user.tiers.includes(DEVELOPER_PROFILE_TIER)
    || session.user.tiers.includes("chief_assistant_district_attorney");
  const filingGroup = filing ? filing.case.divisionGroup ?? filing.case.assignedAttorney?.divisionGroup ?? filing.case.createdBy.divisionGroup : null;
  if (!filing || !canReviewDivision(session.user.tiers, user.division, filing.case.division, user.divisionGroup, filingGroup) || (filing.addedById === user.id && !mayReviewOwnFiling)) throw new Error("This filing is outside your review authority.");

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.caseFiling.updateMany({
      where: { id, status: "PENDING" },
      data: { status: decision, reviewedById: user.id, reviewedAt: new Date(), reviewNote: note || null },
    });
    if (!claimed.count) throw new Error("This filing has already been reviewed. Refresh the queue.");
    await tx.case.update({ where: { id: filing.caseId }, data: { updatedAt: new Date() } });
    await tx.caseComment.create({ data: {
      caseId: filing.caseId,
      body: filing.isInitial && decision === "ACCEPTED"
        ? `Initial complaint approved in the portal for court filing by ${session.user.displayName}. Mark it filed in court after it is filed.${note ? ` Review note: ${note}` : ""}`
        : `Filing “${filing.title}” ${decision === "ACCEPTED" ? "approved" : "returned"} by ${session.user.displayName}.${note ? ` Review note: ${note}` : ""}`,
      isSystem: true,
    } });
  });

  if (decision === "ACCEPTED" && filing.pdfData) {
    after(async () => {
      try { await indexAcceptedCaseFiling(filing.id); }
      catch (error) { console.error(`[filing text index ${filing.id}] Search indexing failed`, error); }
    });
  }
  await logActivity(session.user.displayName, `${decision === "ACCEPTED" ? "Approved" : "Returned"} filing`, "Case", `${filing.case.caseNumber} · ${filing.title}`);

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

async function updateCrimeTipImpl(formData: FormData) {
  const session = await auth();
  if (!session?.user?.providerUserId || !hasCapability(session.user.tiers, CAPABILITIES.TIPS_REVIEW)) throw new Error("Forbidden");
  const user = await localUser(session.user);
  if (!user) throw new Error("Forbidden");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "").trim() || null;
  const linkedCaseId = String(formData.get("linkedCaseId") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const mayOpenCase = hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE);
  const allowedStatuses = new Set(["NEW", "UNDER_REVIEW", "FOLLOW_UP", "REFERRED", "NO_JURISDICTION", "INSUFFICIENT", "DUPLICATE", "OPENED_AS_CASE", "CLOSED"]);
  if (!id || !allowedStatuses.has(status)) throw new Error("Choose a valid tip status.");
  if (!mayOpenCase && (status === "OPENED_AS_CASE" || linkedCaseId)) throw new Error("Only an attorney may link a tip to a case or mark it opened as a case.");
  const tip = await prisma.crimeTip.findUnique({ where: { id }, select: { id: true, status: true, assignedToId: true, linkedCaseId: true, reference: true } });
  if (!tip) throw new Error("Tip not found.");
  if (linkedCaseId) {
    const linkedCase = await prisma.case.findUnique({ where: { id: linkedCaseId } });
    if (!linkedCase || !canAccessCase(session.user.tiers, user.id, linkedCase, user.division, user.divisionGroup)) throw new Error("Choose a case you are authorized to access.");
  }
  if (status === "OPENED_AS_CASE" && !linkedCaseId && !tip.linkedCaseId) throw new Error("Select the case this tip was opened under before using that status.");
  if (assigneeId) {
    const reviewers = await userIdsWithCapability(CAPABILITIES.TIPS_REVIEW);
    if (!reviewers.includes(assigneeId)) throw new Error("Choose an authorized tip reviewer.");
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.crimeTip.updateMany({ where: { id }, data: { status, assignedToId: assigneeId, ...(linkedCaseId ? { linkedCaseId } : {}) } });
    if (!updated.count) throw new Error("Tip changed before this update. Refresh and retry.");
    const caseText = linkedCaseId && linkedCaseId !== tip.linkedCaseId ? `; linked to case ${linkedCaseId}` : "";
    await tx.crimeTipEvent.create({ data: { tipId: id, actorId: user.id, action: `Status changed from ${tip.status} to ${status}${assigneeId !== tip.assignedToId ? `; assigned to ${assigneeId ?? "unassigned"}` : ""}${caseText}`, note: note || null } });
  });
  if (assigneeId && assigneeId !== user.id && assigneeId !== tip.assignedToId) {
    try { await notify({ userId: assigneeId, type: "crime_tip", title: "A crime tip was assigned to you", body: "Open the restricted intake queue to review it.", link: "/dashboard/review?type=tip" }); }
    catch (error) { console.error(`[tip ${tip.reference}] Assignment saved, notification failed`, error); }
  }
  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/work-queue");
}

export async function updateCrimeTip(formData: FormData) { return runWithActionDebug("updateCrimeTip", [formData], () => updateCrimeTipImpl(formData)); }

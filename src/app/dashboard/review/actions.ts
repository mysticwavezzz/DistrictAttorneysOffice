"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser, canReviewDivision } from "@/lib/case-access";
import { notify } from "@/lib/notifications";
import { runWithActionDebug } from "@/lib/action-debug";

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

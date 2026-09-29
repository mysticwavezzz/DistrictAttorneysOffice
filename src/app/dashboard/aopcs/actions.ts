"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { aopcInputSchema } from "@/lib/validation/aopc";
import { localUser, generateCaseNumber } from "@/lib/case-access";
import { notify, notifyMany, userIdsWithCapability } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

async function requireSubmitter() {
  const session = await auth();
  if (!session?.user?.discordUserId || !hasCapability(session.user.tiers, CAPABILITIES.AOPC_SUBMIT)) {
    throw new Error("Forbidden");
  }
  const user = await localUser(session.user.discordUserId);
  if (!user) throw new Error("Local staff record not found");
  return { session, user };
}

async function requireReviewer() {
  const session = await auth();
  if (!session?.user?.discordUserId || !hasCapability(session.user.tiers, CAPABILITIES.AOPC_REVIEW)) {
    throw new Error("Forbidden");
  }
  const user = await localUser(session.user.discordUserId);
  if (!user) throw new Error("Local staff record not found");
  return { session, user };
}

export async function submitAopc(formData: FormData) {
  const { session, user } = await requireSubmitter();

  const parsed = aopcInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid AOPC");
  const data = parsed.data;

  const created = await prisma.aopc.create({
    data: {
      title: data.title,
      targetUnit: data.targetUnit,
      subject: data.subject,
      narrative: data.narrative,
      submittedById: user.id,
    },
  });

  const reviewerIds = await userIdsWithCapability(CAPABILITIES.AOPC_REVIEW);
  await notifyMany(
    reviewerIds.filter((id) => id !== user.id),
    {
      type: "aopc_submitted",
      title: `New AOPC for ${data.targetUnit}: ${data.title}`,
      body: `Submitted by ${session.user.displayName}`,
      link: "/dashboard/aopcs",
    }
  );

  await logActivity(session.user.displayName, "submitted", "AOPC", `${created.title} (${data.targetUnit})`);

  revalidatePath("/dashboard/aopcs");
  redirect("/dashboard/aopcs");
}

export async function reviewAopc(formData: FormData) {
  const { session, user } = await requireReviewer();

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 1000);
  if (!id || (decision !== "ACCEPT" && decision !== "REJECT")) {
    throw new Error("Invalid review submission");
  }

  const aopc = await prisma.aopc.findUnique({ where: { id } });
  if (!aopc || aopc.status !== "PENDING") {
    throw new Error("AOPC not found or already reviewed");
  }

  let linkedCaseId: string | null = null;
  if (decision === "ACCEPT") {
    const caseNumber = await generateCaseNumber();
    const createdCase = await prisma.case.create({
      data: {
        title: aopc.title,
        caseNumber,
        type: "AOPC Referral",
        stage: "Intake",
        summary: `Referred from an accepted AOPC (subject: ${aopc.subject}).\n\n${aopc.narrative}`,
        createdById: user.id,
      },
    });
    linkedCaseId = createdCase.id;
  }

  await prisma.aopc.update({
    where: { id },
    data: {
      status: decision === "ACCEPT" ? "ACCEPTED" : "REJECTED",
      reviewedById: user.id,
      reviewNote: note || null,
      reviewedAt: new Date(),
      linkedCaseId,
    },
  });

  await notify({
    userId: aopc.submittedById,
    type: "aopc_reviewed",
    title: decision === "ACCEPT" ? "Your AOPC was accepted" : "Your AOPC was rejected",
    body: note || undefined,
    link: linkedCaseId ? `/dashboard/cases/${linkedCaseId}` : "/dashboard/aopcs",
  });

  await logActivity(session.user.displayName, decision === "ACCEPT" ? "accepted" : "rejected", "AOPC", aopc.title);

  revalidatePath("/dashboard/aopcs");
}

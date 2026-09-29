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
import { getSiteConfiguration } from "@/lib/site-settings";
import { UNITS } from "@/config/units";

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

  const parsed = aopcInputSchema.safeParse({
    reportId: formData.get("reportId"),
    targetUnit: formData.get("targetUnit"),
    documentUrl: formData.get("documentUrl"),
  });
  if (!parsed.success) throw new Error("Invalid affidavit submission");
  const data = parsed.data;
  if (await prisma.aopc.findUnique({ where: { reportId: data.reportId }, select: { id: true } })) {
    redirect("/dashboard/affidavits?error=report-id-in-use");
  }
  const uploadEntry = formData.get("pdf");
  const file = uploadEntry instanceof File && uploadEntry.size > 0 ? uploadEntry : null;
  if (Boolean(data.documentUrl) === Boolean(file)) {
    throw new Error("Provide either a link to the AOPC or upload one PDF.");
  }
  let pdfData: string | null = null;
  let pdfFileName: string | null = null;
  if (file) {
    if (file.size > 5 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Upload a PDF file no larger than 5 MB.");
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("The uploaded file is not a valid PDF.");
    }
    pdfData = bytes.toString("base64");
    pdfFileName = file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 180);
  }
  const divisions = await getSiteConfiguration("divisions", UNITS);
  if (!divisions.some((unit) => unit.value === data.targetUnit && unit.acceptsAopc)) throw new Error("This division does not accept affidavit referrals");

  const created = await prisma.aopc.create({
    data: {
      title: `AOPC ${data.reportId}`,
      reportId: data.reportId,
      targetUnit: data.targetUnit,
      subject: `AOPC ${data.reportId}`,
      narrative: data.documentUrl ? `AOPC link: ${data.documentUrl}` : `Uploaded PDF: ${pdfFileName}`,
      documentUrl: data.documentUrl || null,
      pdfData,
      pdfFileName,
      submittedById: user.id,
    },
  });

  try {
    const reviewerIds = await userIdsWithCapability(CAPABILITIES.AOPC_REVIEW);
    await notifyMany(reviewerIds.filter((id) => id !== user.id), {
      type: "aopc_submitted",
      title: `New affidavit of probable cause for ${data.targetUnit}: ${data.reportId}`,
      body: `Submitted by ${session.user.displayName}`,
      link: "/dashboard/affidavits",
    });
  } catch (error) {
    console.error("AOPC was submitted, but reviewer notification failed", error);
  }
  try {
    await logActivity(session.user.displayName, "submitted", "affidavit of probable cause", `${data.reportId} (${data.targetUnit})`);
  } catch (error) {
    console.error("AOPC was submitted, but activity logging failed", error);
  }

  revalidatePath("/dashboard/affidavits");
  redirect("/dashboard/affidavits");
}

export async function reviewAopc(formData: FormData) {
  const { session, user } = await requireReviewer();

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 1000);
  if (!id || (decision !== "ACCEPT" && decision !== "REJECT")) {
    throw new Error("Invalid review submission");
  }
  if (decision === "REJECT" && !note.trim()) throw new Error("A review note is required when rejecting an affidavit");

  const { aopc, linkedCaseId } = await prisma.$transaction(async (tx) => {
    const current = await tx.aopc.findUnique({ where: { id } });
    if (!current || current.status !== "PENDING") {
      throw new Error("This AOPC was not found or has already been reviewed.");
    }
    let caseId: string | null = null;
    if (decision === "ACCEPT") {
      const caseNumber = await generateCaseNumber();
      const createdCase = await tx.case.create({
        data: {
          title: current.reportId ? `AOPC ${current.reportId}` : current.title,
          caseNumber,
          type: "Affidavit Referral",
          stage: "Intake",
          summary: `Referred from an accepted affidavit of probable cause (subject: ${current.subject}).\n\n${current.narrative}`,
          createdById: user.id,
        },
      });
      caseId = createdCase.id;
    }
    const updated = await tx.aopc.update({
      where: { id },
      data: {
        status: decision === "ACCEPT" ? "ACCEPTED" : "REJECTED",
        reviewedById: user.id,
        reviewNote: note || null,
        reviewedAt: new Date(),
        linkedCaseId: caseId,
      },
    });
    return { aopc: updated, linkedCaseId: caseId };
  });

  try {
    await notify({
      userId: aopc.submittedById,
      type: "aopc_reviewed",
      title: decision === "ACCEPT" ? "Your affidavit of probable cause was accepted" : "Your affidavit of probable cause was rejected",
      body: note || undefined,
      link: linkedCaseId ? `/dashboard/cases/${linkedCaseId}` : "/dashboard/affidavits",
    });
  } catch (error) {
    console.error("AOPC was reviewed, but the submitter notification failed", error);
  }

  try {
    await logActivity(session.user.displayName, decision === "ACCEPT" ? "accepted" : "rejected", "affidavit of probable cause", aopc.reportId ?? aopc.title);
  } catch (error) {
    console.error("AOPC was reviewed, but activity logging failed", error);
  }

  revalidatePath("/dashboard/affidavits");
  revalidatePath(`/dashboard/affidavits/${id}`);
}

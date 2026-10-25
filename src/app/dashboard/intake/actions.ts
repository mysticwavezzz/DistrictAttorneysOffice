"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { caseVisibilityWhere, localUser } from "@/lib/case-access";
import { AOPC_TARGET_UNITS } from "@/config/units";
import { readCasePdf } from "@/lib/filing-upload";
import { logActivity } from "@/lib/activity-log";
import { notifyMany, userIdsWithCapability } from "@/lib/notifications";

export async function submitIntakeReport(formData: FormData) {
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT))) throw new Error("You do not have permission to submit an AOPC or report.");
  const user = await localUser(session.user);
  if (!user) throw new Error("Staff account not found.");
  const title = String(formData.get("title") ?? "").trim().slice(0, 180);
  const reportId = String(formData.get("reportId") ?? "").trim().slice(0, 100);
  const targetUnit = String(formData.get("targetUnit") ?? "");
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 180);
  const narrative = String(formData.get("narrative") ?? "").trim().slice(0, 20_000);
  const documentUrlRaw = String(formData.get("documentUrl") ?? "").trim();
  let documentUrl: string | null = null;
  if (documentUrlRaw) {
    try { const parsed = new URL(documentUrlRaw); if (!["https:", "http:"].includes(parsed.protocol)) throw new Error(); documentUrl = parsed.toString(); }
    catch { throw new Error("Enter a valid HTTP or HTTPS source link."); }
  }
  const linkedCaseId = String(formData.get("linkedCaseId") ?? "").trim();
  const pdf = await readCasePdf(formData.get("pdf"));
  if (!title || !subject || narrative.length < 20 || !AOPC_TARGET_UNITS.includes(targetUnit) || (!pdf && !documentUrl)) throw new Error("Complete the title, target division, subject, narrative, and attach a PDF or source link.");

  if (linkedCaseId) {
    const visibility = caseVisibilityWhere(session.user.tiers, user.id, user.division, user.divisionGroup);
    const linkedCase = await prisma.case.findFirst({ where: { id: linkedCaseId, ...(visibility ? { AND: [visibility] } : {}) }, select: { id: true } });
    if (!linkedCase) throw new Error("The selected case is not available to your account.");
  }

  const item = await prisma.aopc.create({ data: {
    title, reportId: reportId || null, targetUnit, subject, narrative,
    documentUrl, pdfData: pdf?.pdfData ?? null, pdfFileName: pdf?.pdfFileName ?? null,
    status: "PENDING", submittedById: user.id, linkedCaseId: linkedCaseId || null,
  } });
  await logActivity(session.user.displayName, "Submitted AOPC or investigative report for review", "AOPC", reportId || title);
  const reviewerIds = await userIdsWithCapability(CAPABILITIES.CASES_APPROVE_EDITS);
  if (reviewerIds.length) await notifyMany(reviewerIds.filter((id) => id !== user.id), { type: "aopc_review", title: "AOPC or report needs review", body: `${targetUnit} · ${reportId || title}`, link: "/dashboard/review?type=aopc" }).catch((error) => console.error(`[intake notification ${item.id}]`, error));
  revalidatePath("/dashboard/intake");
  revalidatePath("/dashboard/review");
  redirect("/dashboard/intake?submitted=1");
}

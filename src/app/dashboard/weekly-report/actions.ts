"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEVELOPER_PROFILE_TIER } from "@/lib/permissions/tiers";
import { hasActiveDeveloperProfile } from "@/lib/developer-profile-access";
import { getWeekStartKey, WEEKLY_REPORT_METRICS_KEY } from "@/lib/weekly-report-metrics";
import { updateSiteConfiguration } from "@/lib/site-settings";
import { logActivity } from "@/lib/activity-log";

export async function saveWeeklyReportMetrics(formData: FormData) {
  const session = await auth();
  const user = session?.user;
  const isDistrictAttorney = Boolean(user?.tiers.includes("district_attorney"));
  const isDeveloper = user
    ? user.tiers.includes(DEVELOPER_PROFILE_TIER) && await hasActiveDeveloperProfile(user)
    : false;
  if (!user?.providerUserId || (!isDistrictAttorney && !isDeveloper)) throw new Error("Only the District Attorney or active Developer Profile may edit public weekly report figures.");

  const weekStart = getWeekStartKey();
  if (String(formData.get("weekStart") ?? "") !== weekStart) throw new Error("This report week has changed. Refresh the page and review the current figures.");
  const rawValues = {
    expungementsContested: String(formData.get("expungementsContested") ?? ""),
    expungementsProcessed: String(formData.get("expungementsProcessed") ?? ""),
    vacaturRequestsIssued: String(formData.get("vacaturRequestsIssued") ?? ""),
    vacaturRequestsProcessed: String(formData.get("vacaturRequestsProcessed") ?? ""),
  };
  if (Object.values(rawValues).some((value) => !/^\d{1,6}$/.test(value))) {
    throw new Error("Enter whole-number counts from 0 to 100,000 for each measure.");
  }
  const values = Object.fromEntries(Object.entries(rawValues).map(([key, value]) => [key, Number(value)])) as Record<keyof typeof rawValues, number>;

  const savedAt = new Date().toISOString();
  await updateSiteConfiguration(WEEKLY_REPORT_METRICS_KEY, {
    weekStart,
    ...values,
    updatedAt: savedAt,
    updatedBy: user.displayName,
  });
  await logActivity(user.displayName, "Updated public weekly report post-conviction figures", "Weekly report", weekStart);
  revalidatePath("/");
  revalidatePath("/dashboard/weekly-report");
  revalidatePath("/dashboard");
  redirect("/dashboard/weekly-report?saved=1");
}

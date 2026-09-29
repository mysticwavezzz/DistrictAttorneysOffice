"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { updateSiteSettings } from "@/lib/site-settings";
import { logActivity } from "@/lib/activity-log";
import { CLEAR_DATA_CONFIRMATION } from "./constants";

async function requireSettingsManager() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function updateMaintenanceSettings(formData: FormData) {
  const session = await requireSettingsManager();
  const maintenanceMode = formData.get("maintenanceMode") === "on";
  const maintenanceMessage = String(formData.get("maintenanceMessage") ?? "").trim();

  await updateSiteSettings({ maintenanceMode, maintenanceMessage: maintenanceMessage || null });

  await logActivity(
    session.user.displayName,
    maintenanceMode ? "enabled" : "disabled",
    "site setting",
    "maintenance mode"
  );

  revalidatePath("/98981");
}

export async function updateNotificationSettings(formData: FormData) {
  const session = await requireSettingsManager();
  const notificationsDisabled = formData.get("notificationsDisabled") === "on";

  await updateSiteSettings({ notificationsDisabled });

  await logActivity(
    session.user.displayName,
    notificationsDisabled ? "disabled" : "enabled",
    "site setting",
    "notifications"
  );

  revalidatePath("/98981");
}

export async function clearAllData(formData: FormData) {
  const session = await requireSettingsManager();
  const confirmation = String(formData.get("confirmation") ?? "");
  if (confirmation !== CLEAR_DATA_CONFIRMATION) {
    throw new Error(`Type "${CLEAR_DATA_CONFIRMATION}" exactly to confirm.`);
  }

  await prisma.$transaction([
    prisma.aopc.deleteMany({}),
    prisma.case.deleteMany({}),
    prisma.announcement.deleteMany({}),
    prisma.recordsRequest.deleteMany({}),
    prisma.notification.deleteMany({}),
    prisma.activityLog.deleteMany({}),
  ]);

  await logActivity(session.user.displayName, "cleared", "all case & content data", "via settings page");

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/announcements");
  revalidatePath("/dashboard/activity");
  revalidatePath("/dashboard/records-requests");
  revalidatePath("/dashboard/affidavits");
  revalidatePath("/");
  revalidatePath("/98981");
}

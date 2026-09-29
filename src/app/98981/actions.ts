"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability } from "@/lib/permissions";
import { updateSiteSettings } from "@/lib/site-settings";
import { logActivity } from "@/lib/activity-log";
import { CLEAR_DATA_CONFIRMATION } from "./constants";
import { DISCORD_TIER_ROLE_MAPPINGS } from "@/config/discord-role-mappings";
import { UNITS } from "@/config/units";
import { RANKS } from "@/config/ranks";
import { CASE_STATUSES } from "@/config/case-statuses";
import { ALL_TIERS } from "@/lib/permissions/tiers";
import { CAPABILITIES } from "@/lib/permissions/capabilities";
import { getSiteConfiguration, updateSiteConfiguration } from "@/lib/site-settings";
import { z } from "zod";

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
  const estimatedAtRaw = String(formData.get("maintenanceEstimatedAt") ?? "").trim();
  const maintenanceEstimatedAt = estimatedAtRaw ? new Date(estimatedAtRaw) : null;
  if (maintenanceEstimatedAt && Number.isNaN(maintenanceEstimatedAt.getTime())) {
    throw new Error("Invalid estimated return time");
  }

  await updateSiteSettings({ maintenanceMode, maintenanceMessage: maintenanceMessage || null, maintenanceEstimatedAt });

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

function parseJsonField(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(String(formData.get(name) ?? ""));
  } catch {
    throw new Error(`${name} must contain valid JSON`);
  }
}

export async function saveApplicationConfiguration(formData: FormData) {
  const session = await requireSettingsManager();
  const capabilityValues = Object.values(CAPABILITIES);
  const roleMappingsSchema = z.array(z.object({
    tier: z.enum(ALL_TIERS as [typeof ALL_TIERS[number], ...typeof ALL_TIERS[number][]]),
    roleIds: z.array(z.string().regex(/^\d{5,25}$/)).max(30),
  })).length(ALL_TIERS.length);
  const tierCapabilitiesSchema = z.record(
    z.enum(ALL_TIERS as [typeof ALL_TIERS[number], ...typeof ALL_TIERS[number][]]),
    z.array(z.enum(capabilityValues as [string, ...string[]]))
  );
  const divisionsSchema = z.array(z.object({ value: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(100), description: z.string().trim().max(500), leaderRank: z.string().trim().max(100).optional(), acceptsAopc: z.boolean().optional() })).min(1).max(30);
  const ranksSchema = z.array(z.object({ value: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(100), isLeadership: z.boolean() })).min(1).max(50);
  const statusesSchema = z.array(z.object({ value: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(100), color: z.enum(["navy", "gold", "green", "red", "muted"]) })).min(1).max(50);

  const roleMappings = roleMappingsSchema.parse(parseJsonField(formData, "discordRoleMappings"));
  const tierCapabilities = tierCapabilitiesSchema.parse(parseJsonField(formData, "tierCapabilities")) as Record<string, string[]>;
  const divisions = divisionsSchema.parse(parseJsonField(formData, "divisions"));
  const ranks = ranksSchema.parse(parseJsonField(formData, "ranks"));
  const caseStatuses = statusesSchema.parse(parseJsonField(formData, "caseStatuses"));

  if (!ALL_TIERS.some((tier) => (tierCapabilities[tier] ?? []).includes(CAPABILITIES.SETTINGS_MANAGE))) {
    throw new Error("At least one permission tier must retain site settings access.");
  }
  const currentRoleMappings = await getSiteConfiguration("discordRoleMappings", DISCORD_TIER_ROLE_MAPPINGS);
  const currentAdminTiers = session.user.tiers.filter((tier): tier is (typeof ALL_TIERS)[number] => (ALL_TIERS as readonly string[]).includes(tier));
  for (const tier of currentAdminTiers) {
    if (!(tierCapabilities[tier] ?? []).includes(CAPABILITIES.SETTINGS_MANAGE)) {
      throw new Error("Keep site settings access on one of your current permission tiers.");
    }
    const oldRoleIds = currentRoleMappings.find((mapping) => mapping.tier === tier)?.roleIds ?? [];
    const newRoleIds = roleMappings.find((mapping) => mapping.tier === tier)?.roleIds ?? [];
    if (JSON.stringify(oldRoleIds) !== JSON.stringify(newRoleIds)) {
      throw new Error("Your current tier's Discord role mapping cannot be changed from the active admin session.");
    }
  }
  if (new Set(roleMappings.map((mapping) => mapping.tier)).size !== ALL_TIERS.length) {
    throw new Error("Provide exactly one Discord role mapping for each permission tier.");
  }
  if (new Set(divisions.map((unit) => unit.value)).size !== divisions.length) throw new Error("Division values must be unique.");
  if (new Set(ranks.map((rank) => rank.value)).size !== ranks.length) throw new Error("Rank values must be unique.");
  if (new Set(caseStatuses.map((status) => status.value)).size !== caseStatuses.length) throw new Error("Case status values must be unique.");

  await Promise.all([
    updateSiteConfiguration("discordRoleMappings", roleMappings),
    updateSiteConfiguration("tierCapabilities", tierCapabilities),
    updateSiteConfiguration("divisions", divisions),
    updateSiteConfiguration("ranks", ranks),
    updateSiteConfiguration("caseStatuses", caseStatuses),
  ]);
  await logActivity(session.user.displayName, "updated", "application configuration", "permissions, divisions, ranks, and case statuses");
  revalidatePath("/98981");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/roster");
  revalidatePath("/dashboard/affidavits");
  revalidatePath("/office-info");
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

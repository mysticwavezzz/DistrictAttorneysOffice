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
import { ALL_TIERS, TIER_DEFINITIONS } from "@/lib/permissions/tiers";
import { CAPABILITIES } from "@/lib/permissions/capabilities";
import { getSiteConfiguration, updateSiteConfiguration } from "@/lib/site-settings";
import { createConfigurationBackup, recordSettingsAudit } from "@/lib/settings-audit";
import { z } from "zod";
import { CRIME_TIP_FORM } from "@/config/crime-tip-form";
import { parseDateTimeInTimeZone } from "@/lib/time-zone";
import { VERSION_SCHEMA } from "@/lib/site-version";
import { env } from "@/lib/env";
import { ROBLOX_TIER_ROLE_MAPPINGS } from "@/config/roblox-role-mappings";
import { fetchRobloxGroupRoles } from "@/lib/roblox/groups";
import { resolveTiersFromRobloxRoles } from "@/lib/permissions/resolve";

async function requireSettingsManager() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function updateAuthProvider(formData: FormData) {
  const session = await requireSettingsManager();
  const provider = String(formData.get("authProvider") ?? "");
  if (provider !== "discord" && provider !== "roblox") throw new Error("Choose Roblox or Discord sign-in.");
  const configured = provider === "roblox"
    ? Boolean(env.ROBLOX_CLIENT_ID && env.ROBLOX_CLIENT_SECRET)
    : Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID);
  if (!configured) throw new Error(provider === "roblox"
    ? "Add the Roblox client ID and rotated client secret in Railway before selecting Roblox sign-in."
    : "Add the Discord client ID, secret, bot token, and server ID in Railway before selecting Discord sign-in.");

  if (provider === "roblox") {
    const [mappingRow, capabilityRow] = await Promise.all([
      prisma.siteConfiguration.findUnique({ where: { key: "robloxTierRoleMappings" } }),
      prisma.siteConfiguration.findUnique({ where: { key: "tierCapabilities" } }),
    ]);
    const mappings = mappingRow ? JSON.parse(mappingRow.value) as typeof ROBLOX_TIER_ROLE_MAPPINGS : ROBLOX_TIER_ROLE_MAPPINGS;
    const tierCapabilities = capabilityRow ? JSON.parse(capabilityRow.value) as Record<string, string[]> : {};
    if (!mappings.some((mapping) => mapping.roleIds.length && (tierCapabilities[mapping.tier] ?? TIER_DEFINITIONS[mapping.tier].capabilities).includes(CAPABILITIES.SETTINGS_MANAGE))) {
      throw new Error("Roblox sign-in cannot be enabled until a Roblox role is mapped to a tier with Site Settings access.");
    }
  }

  await createConfigurationBackup(session.user.displayName);
  await updateSiteConfiguration("authProvider", provider);
  await recordSettingsAudit(session.user.displayName, "Staff sign-in provider changed", `New staff sign-ins will use ${provider}. Existing sessions are not terminated.`);
  revalidatePath("/98981");
  revalidatePath("/login");
}

export async function updateMaintenanceSettings(formData: FormData) {
  const session = await requireSettingsManager();
  const maintenanceMode = formData.get("maintenanceMode") === "on";
  const maintenanceMessage = String(formData.get("maintenanceMessage") ?? "").trim();
  const estimatedAtRaw = String(formData.get("maintenanceEstimatedAt") ?? "").trim();
  const exemptTiers = Array.from(new Set(formData.getAll("maintenanceExemptTiers").map(String)));
  const exemptUserIds = Array.from(new Set(String(formData.get("maintenanceExemptDiscordUserIds") ?? "").split(/[\s,]+/).map((id) => id.trim()).filter(Boolean)));
  const maintenanceEstimatedAt = estimatedAtRaw ? parseDateTimeInTimeZone(estimatedAtRaw, "America/New_York") : null;
  if (estimatedAtRaw && !maintenanceEstimatedAt) {
    throw new Error("Enter a valid estimated return time in Eastern Time.");
  }
  if (exemptTiers.some((tier) => !(ALL_TIERS as readonly string[]).includes(tier))) {
    throw new Error("Choose valid permission tiers for maintenance exemptions.");
  }
  if (exemptUserIds.length > 100 || exemptUserIds.some((id) => !/^\d{5,25}$/.test(id))) {
    throw new Error("Enter up to 100 numeric account IDs from the selected sign-in provider, separated by commas or new lines.");
  }

  await createConfigurationBackup(session.user.displayName);
  await Promise.all([
    updateSiteSettings({ maintenanceMode, maintenanceMessage: maintenanceMessage || null, maintenanceEstimatedAt, maintenanceTimeZone: "America/New_York" }),
    updateSiteConfiguration("maintenanceExemptTiers", exemptTiers),
    updateSiteConfiguration("maintenanceExemptDiscordUserIds", exemptUserIds),
  ]);
  const tierLabels = exemptTiers.map((tier) => Object.values(TIER_DEFINITIONS).find((definition) => definition.id === tier)?.label ?? tier);
  await recordSettingsAudit(session.user.displayName, "Maintenance settings changed", `Mode ${maintenanceMode ? "enabled" : "disabled"}; return-time setting ${maintenanceEstimatedAt ? "updated" : "cleared"}; exempt tiers: ${tierLabels.join(", ") || "none"}; exempt individual accounts: ${exemptUserIds.length}.`);

  await logActivity(
    session.user.displayName,
    maintenanceMode ? "enabled" : "disabled",
    "site setting",
    "maintenance mode"
  );

  revalidatePath("/98981");
}

export async function updateWebsiteVersion(formData: FormData) {
  const session = await requireSettingsManager();
  const version = String(formData.get("websiteVersion") ?? "").trim();
  if (version && !VERSION_SCHEMA.test(version)) {
    throw new Error("Version must use three numeric parts, like 0.1.3.");
  }
  await createConfigurationBackup(session.user.displayName);
  await updateSiteConfiguration("websiteVersion", version);
  await recordSettingsAudit(session.user.displayName, "Website version override changed", version ? `Version manually set to ${version}.` : "Manual version override cleared; package version will be used.");
  revalidatePath("/98981");
  revalidatePath("/maintenance");
}

export async function addCrimeTipBlacklistEntry(formData: FormData) {
  const session = await requireSettingsManager();
  const kind = String(formData.get("kind") ?? "");
  const identifier = String(formData.get("identifier") ?? "").trim().replace(/\s+/g, " ");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!(kind === "roblox" || kind === "discord") || identifier.length < 2 || identifier.length > 160 || reason.length < 3 || reason.length > 500) {
    throw new Error("Choose Roblox or Discord, enter an identifier, and provide a reason (3–500 characters).");
  }
  const identifierKey = `${kind}:${identifier.toLocaleLowerCase("en-US")}`;
  await prisma.crimeTipBlacklist.upsert({
    where: { identifierKey },
    create: { kind, identifier, identifierKey, reason, createdBy: session.user.displayName },
    update: { identifier, reason, createdBy: session.user.displayName },
  });
  await recordSettingsAudit(session.user.displayName, "Crime tip identifier blacklisted", `${kind} identifier ${identifier} was added to the tip-line blacklist.`);
  revalidatePath("/98981");
}

export async function removeCrimeTipBlacklistEntry(formData: FormData) {
  const session = await requireSettingsManager();
  const id = String(formData.get("id") ?? "");
  if (!id || id.length > 100) throw new Error("Invalid blacklist entry.");
  const entry = await prisma.crimeTipBlacklist.findUnique({ where: { id } });
  if (!entry) throw new Error("Blacklist entry not found.");
  await prisma.crimeTipBlacklist.delete({ where: { id } });
  await recordSettingsAudit(session.user.displayName, "Crime tip identifier removed from blacklist", `${entry.kind} identifier ${entry.identifier} was removed from the tip-line blacklist.`);
  revalidatePath("/98981");
}

export async function updateNotificationSettings(formData: FormData) {
  const session = await requireSettingsManager();
  const notificationsDisabled = formData.get("notificationsDisabled") === "on";
  const deadlineReminderDays = String(formData.get("deadlineReminderDays") ?? "7,3,1").trim();
  const reminderDays = deadlineReminderDays.split(",").map((value) => Number(value.trim()));
  if (!deadlineReminderDays || reminderDays.length > 10 || reminderDays.some((day) => !Number.isInteger(day) || day < 1 || day > 90)) {
    throw new Error("Reminder days must be comma-separated whole numbers between 1 and 90.");
  }
  const overdueRemindersEnabled = formData.get("overdueRemindersEnabled") === "on";

  await createConfigurationBackup(session.user.displayName);
  await updateSiteSettings({ notificationsDisabled, deadlineReminderDays: Array.from(new Set(reminderDays)).sort((a, b) => b - a).join(","), overdueRemindersEnabled });
  await recordSettingsAudit(session.user.displayName, "Notification and deadline settings changed", `Notifications ${notificationsDisabled ? "disabled" : "enabled"}; reminders ${reminderDays.length} day(s) before deadline; overdue reminders ${overdueRemindersEnabled ? "enabled" : "disabled"}.`);

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
  const robloxRoleMappingsSchema = z.array(z.object({
    tier: z.enum(ALL_TIERS as [typeof ALL_TIERS[number], ...typeof ALL_TIERS[number][]]),
    groupId: z.number().int().positive(),
    roleIds: z.array(z.number().int().positive()).max(100),
  })).max(100);
  const robloxRoleMappings = robloxRoleMappingsSchema.parse(parseJsonField(formData, "robloxTierRoleMappings"));
  const tierCapabilities = tierCapabilitiesSchema.parse(parseJsonField(formData, "tierCapabilities")) as Record<string, string[]>;
  const divisions = divisionsSchema.parse(parseJsonField(formData, "divisions"));
  const ranks = ranksSchema.parse(parseJsonField(formData, "ranks"));
  const caseStatuses = statusesSchema.parse(parseJsonField(formData, "caseStatuses"));
  const crimeTipFormSchema = z.object({
    viewUrl: z.string().url().refine((url) => new URL(url).hostname === "docs.google.com", "Use a Google Forms view URL."),
    actionUrl: z.string().url().refine((url) => new URL(url).hostname === "docs.google.com" && new URL(url).pathname.endsWith("/formResponse"), "Use a Google Forms formResponse URL."),
    entries: z.object(Object.fromEntries(Object.keys(CRIME_TIP_FORM.entries).map((key) => [key, z.string().regex(/^entry\.\d+$/)])) as Record<keyof typeof CRIME_TIP_FORM.entries, z.ZodString>),
    crimeTypes: z.array(z.string().trim().min(1).max(100)).min(2).max(20),
  });
  const crimeTipForm = crimeTipFormSchema.parse(parseJsonField(formData, "crimeTipForm"));

  if (!ALL_TIERS.some((tier) => (tierCapabilities[tier] ?? []).includes(CAPABILITIES.SETTINGS_MANAGE))) {
    throw new Error("At least one permission tier must retain site settings access.");
  }
  const currentRoleMappings = await getSiteConfiguration("discordRoleMappings", DISCORD_TIER_ROLE_MAPPINGS);
  const currentAdminTiers = session.user.tiers.filter((tier): tier is (typeof ALL_TIERS)[number] => (ALL_TIERS as readonly string[]).includes(tier));
  for (const tier of currentAdminTiers) {
    if (!(tierCapabilities[tier] ?? []).includes(CAPABILITIES.SETTINGS_MANAGE)) {
      throw new Error("Keep site settings access on one of your current permission tiers.");
    }
    if (session.user.identityProvider === "discord") {
      const oldRoleIds = currentRoleMappings.find((mapping) => mapping.tier === tier)?.roleIds ?? [];
      const newRoleIds = roleMappings.find((mapping) => mapping.tier === tier)?.roleIds ?? [];
      if (JSON.stringify(oldRoleIds) !== JSON.stringify(newRoleIds)) {
        throw new Error("Your current tier's Discord role mapping cannot be changed from the active admin session.");
      }
    }
  }
  if (session.user.identityProvider === "roblox" && session.user.robloxUserId) {
    const currentRoles = await fetchRobloxGroupRoles(session.user.robloxUserId);
    const currentTiers = resolveTiersFromRobloxRoles(currentRoles, robloxRoleMappings);
    if (!currentTiers.some((tier) => (tierCapabilities[tier] ?? TIER_DEFINITIONS[tier].capabilities).includes(CAPABILITIES.SETTINGS_MANAGE))) {
      throw new Error("These mappings would remove your Site Settings access. Keep one of your current Roblox roles mapped to an administrator tier.");
    }
  }
  if (new Set(roleMappings.map((mapping) => mapping.tier)).size !== ALL_TIERS.length) {
    throw new Error("Provide exactly one Discord role mapping for each permission tier.");
  }
  const mappedRoleKeys = robloxRoleMappings.flatMap((mapping) => mapping.roleIds.map((id) => `${mapping.groupId}:${id}`));
  if (new Set(mappedRoleKeys).size !== mappedRoleKeys.length) throw new Error("Each Roblox group role can map to only one permission tier.");
  if (!robloxRoleMappings.some((mapping) => mapping.roleIds.length && (tierCapabilities[mapping.tier] ?? TIER_DEFINITIONS[mapping.tier].capabilities).includes(CAPABILITIES.SETTINGS_MANAGE))) {
    throw new Error("Keep at least one mapped Roblox tier with Site Settings access so administrators can recover access.");
  }
  if (new Set(divisions.map((unit) => unit.value)).size !== divisions.length) throw new Error("Division values must be unique.");
  if (new Set(ranks.map((rank) => rank.value)).size !== ranks.length) throw new Error("Rank values must be unique.");
  if (new Set(caseStatuses.map((status) => status.value)).size !== caseStatuses.length) throw new Error("Case status values must be unique.");

  await createConfigurationBackup(session.user.displayName);
  await Promise.all([
    updateSiteConfiguration("discordRoleMappings", roleMappings),
    updateSiteConfiguration("robloxTierRoleMappings", robloxRoleMappings),
    updateSiteConfiguration("tierCapabilities", tierCapabilities),
    updateSiteConfiguration("divisions", divisions),
    updateSiteConfiguration("ranks", ranks),
    updateSiteConfiguration("caseStatuses", caseStatuses),
    updateSiteConfiguration("crimeTipForm", crimeTipForm),
  ]);
  await recordSettingsAudit(session.user.displayName, "Application configuration changed", "Discord and Roblox role mappings, tier permissions, divisions, ranks, case statuses, and Google Forms integration saved.");
  await logActivity(session.user.displayName, "updated", "application configuration", "permissions, divisions, ranks, case statuses, and crime tip routing");
  revalidatePath("/98981");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/roster");
  revalidatePath("/dashboard/affidavits");
  revalidatePath("/contacts");
}

export async function saveConfigurationBackup() {
  const session = await requireSettingsManager();
  const backup = await createConfigurationBackup(session.user.displayName);
  await recordSettingsAudit(session.user.displayName, "Configuration backup created", `Backup ${backup.id} created.`);
  revalidatePath("/98981");
}

export async function restoreConfigurationBackup(formData: FormData) {
  const session = await requireSettingsManager();
  const id = String(formData.get("backupId") ?? "");
  if (!id) throw new Error("Choose a configuration backup.");
  const backup = await prisma.configurationBackup.findUnique({ where: { id } });
  if (!backup) throw new Error("Configuration backup not found.");

  let payload: unknown;
  try { payload = JSON.parse(backup.payload); } catch { throw new Error("This backup is unreadable."); }
  const settingsSchema = z.object({
    id: z.number().optional(),
    maintenanceMode: z.boolean(),
    maintenanceMessage: z.string().nullable(),
    maintenanceEstimatedAt: z.string().nullable().or(z.date()).nullable().optional(),
    maintenanceTimeZone: z.string().optional(),
    notificationsDisabled: z.boolean(),
    deadlineReminderDays: z.string().optional(),
    overdueRemindersEnabled: z.boolean().optional(),
  });
  const backupSchema = z.object({
    siteSettings: settingsSchema.nullable(),
    configurations: z.array(z.object({ key: z.string().min(1).max(100), value: z.string().max(100_000) })),
  });
  const parsed = backupSchema.parse(payload);
  await createConfigurationBackup(session.user.displayName);
  await prisma.$transaction(async (tx) => {
    const settings = parsed.siteSettings;
    if (settings) {
      await tx.siteSettings.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          maintenanceMode: settings.maintenanceMode,
          maintenanceMessage: settings.maintenanceMessage,
          maintenanceEstimatedAt: settings.maintenanceEstimatedAt ? new Date(settings.maintenanceEstimatedAt) : null,
          maintenanceTimeZone: settings.maintenanceTimeZone ?? "legacy-utc",
          notificationsDisabled: settings.notificationsDisabled,
          deadlineReminderDays: settings.deadlineReminderDays ?? "7,3,1",
          overdueRemindersEnabled: settings.overdueRemindersEnabled ?? true,
        },
        update: {
          maintenanceMode: settings.maintenanceMode,
          maintenanceMessage: settings.maintenanceMessage,
          maintenanceEstimatedAt: settings.maintenanceEstimatedAt ? new Date(settings.maintenanceEstimatedAt) : null,
          maintenanceTimeZone: settings.maintenanceTimeZone ?? "legacy-utc",
          notificationsDisabled: settings.notificationsDisabled,
          deadlineReminderDays: settings.deadlineReminderDays ?? "7,3,1",
          overdueRemindersEnabled: settings.overdueRemindersEnabled ?? true,
        },
      });
    } else await tx.siteSettings.deleteMany({ where: { id: 1 } });
    const keys = parsed.configurations.map((item) => item.key);
    await tx.siteConfiguration.deleteMany({ where: { key: { notIn: keys } } });
    for (const item of parsed.configurations) {
      await tx.siteConfiguration.upsert({ where: { key: item.key }, create: item, update: { value: item.value } });
    }
  });
  await recordSettingsAudit(session.user.displayName, "Configuration restored", `Restored backup ${id} from ${backup.createdAt.toISOString()}. A pre-restore backup was also created.`);
  revalidatePath("/98981");
  revalidatePath("/98981/status");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/roster");
  revalidatePath("/dashboard/affidavits");
  revalidatePath("/contacts");
}

export async function clearAllData(formData: FormData) {
  const session = await requireSettingsManager();
  const confirmation = String(formData.get("confirmation") ?? "");
  if (confirmation !== CLEAR_DATA_CONFIRMATION) {
    throw new Error(`Type "${CLEAR_DATA_CONFIRMATION}" exactly to confirm.`);
  }

  const deleted = await prisma.$transaction(async (tx) => {
    // Keep one internal revocation generation so JWT sessions issued before
    // this wipe cannot become valid again after all user data is removed.
    await tx.siteConfiguration.upsert({
      where: { key: "authSessionGeneration" },
      create: { key: "authSessionGeneration", value: crypto.randomUUID() },
      update: { value: crypto.randomUUID() },
    });

    // Remove every persisted application model, in foreign-key dependency order.
    const counts = {
      deadlineReminders: (await tx.deadlineReminder.deleteMany({})).count,
      filings: (await tx.caseFiling.deleteMany({})).count,
      comments: (await tx.caseComment.deleteMany({})).count,
      caseActionRequests: (await tx.caseActionRequest.deleteMany({})).count,
      aopcs: (await tx.aopc.deleteMany({})).count,
      notifications: (await tx.notification.deleteMany({})).count,
      cases: (await tx.case.deleteMany({})).count,
      announcements: (await tx.announcement.deleteMany({})).count,
      recordsRequests: (await tx.recordsRequest.deleteMany({})).count,
      activityLogs: (await tx.activityLog.deleteMany({})).count,
      rosterEntries: (await tx.rosterEntry.deleteMany({})).count,
      rateLimitBuckets: (await tx.rateLimitBucket.deleteMany({})).count,
      crimeTipBlacklistEntries: (await tx.crimeTipBlacklist.deleteMany({})).count,
      verificationTokens: (await tx.verificationToken.deleteMany({})).count,
      accounts: (await tx.account.deleteMany({})).count,
      sessions: (await tx.session.deleteMany({})).count,
      users: (await tx.user.deleteMany({})).count,
    };
    return counts;
  }, { maxWait: 10_000, timeout: 60_000 });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/announcements");
  revalidatePath("/dashboard/activity");
  revalidatePath("/dashboard/records-requests");
  revalidatePath("/dashboard/affidavits");
  revalidatePath("/");
  revalidatePath("/98981");
  return { success: true as const, deleted };
}

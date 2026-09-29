import { prisma } from "@/lib/prisma";
import { reinterpretLegacyUtcWallTime } from "@/lib/time-zone";

const SETTINGS_ID = 1;

export interface SiteSettingsData {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  maintenanceEstimatedAt: Date | null;
  maintenanceTimeZone: string;
  notificationsDisabled: boolean;
  deadlineReminderDays: string;
  overdueRemindersEnabled: boolean;
  updatedAt: Date | null;
}

const DEFAULTS: SiteSettingsData = {
  maintenanceMode: false,
  maintenanceMessage: null,
  maintenanceEstimatedAt: null,
  maintenanceTimeZone: "America/New_York",
  notificationsDisabled: false,
  deadlineReminderDays: "7,3,1",
  overdueRemindersEnabled: true,
  updatedAt: null,
};

export async function getSiteSettings(): Promise<SiteSettingsData> {
  try {
    const row = await prisma.siteSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) return DEFAULTS;
    return {
      maintenanceMode: row.maintenanceMode,
      maintenanceMessage: row.maintenanceMessage,
      maintenanceEstimatedAt: row.maintenanceEstimatedAt && row.maintenanceTimeZone !== "America/New_York"
        ? reinterpretLegacyUtcWallTime(row.maintenanceEstimatedAt, "America/New_York")
        : row.maintenanceEstimatedAt,
      maintenanceTimeZone: row.maintenanceTimeZone,
      notificationsDisabled: row.notificationsDisabled,
      deadlineReminderDays: row.deadlineReminderDays,
      overdueRemindersEnabled: row.overdueRemindersEnabled,
      updatedAt: row.updatedAt,
    };
  } catch (error) {
    console.error("Failed to load site settings", error);
    return DEFAULTS;
  }
}

export async function updateSiteSettings(data: Partial<Omit<SiteSettingsData, "updatedAt">>) {
  await prisma.siteSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      maintenanceMode: data.maintenanceMode ?? DEFAULTS.maintenanceMode,
      maintenanceMessage: data.maintenanceMessage ?? DEFAULTS.maintenanceMessage,
      maintenanceEstimatedAt: data.maintenanceEstimatedAt ?? DEFAULTS.maintenanceEstimatedAt,
      maintenanceTimeZone: data.maintenanceTimeZone ?? DEFAULTS.maintenanceTimeZone,
      notificationsDisabled: data.notificationsDisabled ?? DEFAULTS.notificationsDisabled,
      deadlineReminderDays: data.deadlineReminderDays ?? DEFAULTS.deadlineReminderDays,
      overdueRemindersEnabled: data.overdueRemindersEnabled ?? DEFAULTS.overdueRemindersEnabled,
    },
    update: data,
  });
}

export async function getSiteConfiguration<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await prisma.siteConfiguration.findUnique({ where: { key }, select: { value: true } });
    return row ? (JSON.parse(row.value) as T) : fallback;
  } catch (error) {
    console.error(`Failed to load site configuration: ${key}`, error);
    return fallback;
  }
}

export async function updateSiteConfiguration(key: string, value: unknown) {
  await prisma.siteConfiguration.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
}

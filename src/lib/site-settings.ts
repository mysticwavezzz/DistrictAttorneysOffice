import { prisma } from "@/lib/prisma";

const SETTINGS_ID = 1;

export interface SiteSettingsData {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  notificationsDisabled: boolean;
}

const DEFAULTS: SiteSettingsData = {
  maintenanceMode: false,
  maintenanceMessage: null,
  notificationsDisabled: false,
};

export async function getSiteSettings(): Promise<SiteSettingsData> {
  try {
    const row = await prisma.siteSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) return DEFAULTS;
    return {
      maintenanceMode: row.maintenanceMode,
      maintenanceMessage: row.maintenanceMessage,
      notificationsDisabled: row.notificationsDisabled,
    };
  } catch (error) {
    console.error("Failed to load site settings", error);
    return DEFAULTS;
  }
}

export async function updateSiteSettings(data: Partial<SiteSettingsData>) {
  await prisma.siteSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...DEFAULTS, ...data },
    update: data,
  });
}

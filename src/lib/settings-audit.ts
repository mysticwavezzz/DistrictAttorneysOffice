import { prisma } from "@/lib/prisma";

const SETTINGS_ID = 1;

export async function recordSettingsAudit(actorName: string, action: string, details: string) {
  await prisma.settingsAuditLog.create({ data: { actorName, action, details } });
}

export async function createConfigurationBackup(actorName: string) {
  const [siteSettings, configurations] = await Promise.all([
    prisma.siteSettings.findUnique({ where: { id: SETTINGS_ID } }),
    prisma.siteConfiguration.findMany({ orderBy: { key: "asc" } }),
  ]);
  return prisma.configurationBackup.create({
    data: {
      actorName,
      payload: JSON.stringify({ siteSettings, configurations: configurations.map(({ key, value }) => ({ key, value })) }),
    },
  });
}

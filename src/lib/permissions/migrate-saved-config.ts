import { prisma } from "@/lib/prisma";
import { PERMISSION_TIERS, TIER_DEFINITIONS } from "./tiers";

const MIGRATION_KEY = "releaseV1_1Migration";

/** Back up saved overrides, then apply the scoped role model and release version once. */
export async function migrateSavedAttorneyPermissions() {
  await prisma.$transaction(async (tx) => {
    const done = await tx.siteConfiguration.findUnique({ where: { key: MIGRATION_KEY }, select: { value: true } });
    if (done?.value === "complete") return;

    const [settings, configurations, saved] = await Promise.all([
      tx.siteSettings.findUnique({ where: { id: 1 } }),
      tx.siteConfiguration.findMany({ orderBy: { key: "asc" } }),
      tx.siteConfiguration.findUnique({ where: { key: "tierCapabilities" } }),
    ]);
    await tx.configurationBackup.create({
      data: {
        actorName: "Automatic 1.1 configuration migration",
        payload: JSON.stringify({ siteSettings: settings, configurations: configurations.map(({ key, value }) => ({ key, value })) }),
      },
    });

    let capabilities: Record<string, string[]> = {};
    try { capabilities = saved ? JSON.parse(saved.value) as Record<string, string[]> : {}; } catch { /* Replace malformed saved role data with safe defaults for affected tiers. */ }
    for (const tier of [
      PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY,
      PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY,
      PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY,
      PERMISSION_TIERS.DA_ATTORNEY,
      PERMISSION_TIERS.SUPERVISING_ADA,
    ]) capabilities[tier] = TIER_DEFINITIONS[tier].capabilities;

    await tx.siteConfiguration.upsert({
      where: { key: "tierCapabilities" },
      create: { key: "tierCapabilities", value: JSON.stringify(capabilities) },
      update: { value: JSON.stringify(capabilities) },
    });
    await tx.siteConfiguration.upsert({ where: { key: "websiteVersion" }, create: { key: "websiteVersion", value: "1.1.0" }, update: { value: "1.1.0" } });
    const legacyCases = await tx.case.findMany({
      where: { division: null },
      select: { id: true, assignedAttorney: { select: { division: true } }, createdBy: { select: { division: true } } },
    });
    const byDivision = new Map<string, string[]>();
    for (const item of legacyCases) {
      const division = item.assignedAttorney?.division ?? item.createdBy.division;
      if (division) byDivision.set(division, [...(byDivision.get(division) ?? []), item.id]);
    }
    for (const [division, caseIds] of byDivision) {
      await tx.case.updateMany({ where: { id: { in: caseIds }, division: null }, data: { division } });
    }
    await tx.siteConfiguration.upsert({ where: { key: MIGRATION_KEY }, create: { key: MIGRATION_KEY, value: "complete" }, update: { value: "complete" } });
  });
}

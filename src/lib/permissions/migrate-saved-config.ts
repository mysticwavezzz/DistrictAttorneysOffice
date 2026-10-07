import { prisma } from "@/lib/prisma";
import { PERMISSION_TIERS, TIER_DEFINITIONS } from "./tiers";
import { mergeRetiredSupervisingAdaMappings } from "@/config/role-mapping-migrations";

const MIGRATION_KEY = "releaseV1_1_1Migration";

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
        actorName: "Automatic 1.1.1 configuration migration",
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
    ]) capabilities[tier] = TIER_DEFINITIONS[tier].capabilities;
    delete capabilities.supervising_ada;

    await tx.siteConfiguration.upsert({
      where: { key: "tierCapabilities" },
      create: { key: "tierCapabilities", value: JSON.stringify(capabilities) },
      update: { value: JSON.stringify(capabilities) },
    });
    const savedRobloxMappings = configurations.find((entry) => entry.key === "robloxTierRoleMappings");
    if (savedRobloxMappings) {
      try {
        const parsedMappings = JSON.parse(savedRobloxMappings.value) as Array<{ tier: string; groupId: number; roleIds: number[] }>;
        await tx.siteConfiguration.update({ where: { key: "robloxTierRoleMappings" }, data: { value: JSON.stringify(mergeRetiredSupervisingAdaMappings(parsedMappings)) } });
      } catch { /* Keep the backed-up raw mapping if it is malformed; auth config validation will fail closed. */ }
    }
    await tx.siteConfiguration.upsert({ where: { key: "websiteVersion" }, create: { key: "websiteVersion", value: JSON.stringify("1.1.1") }, update: { value: JSON.stringify("1.1.1") } });
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

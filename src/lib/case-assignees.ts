import { prisma } from "@/lib/prisma";

const ASSIGNABLE_ATTORNEY_RANKS = [
  "Assistant District Attorney",
  "Supervisory Assistant District Attorney",
  "Chief Assistant District Attorney",
  "Deputy District Attorney",
  "District Attorney",
] as const;

export function isAssignableAttorneyRank(rank: string | null | undefined): boolean {
  return Boolean(rank && (ASSIGNABLE_ATTORNEY_RANKS as readonly string[]).includes(rank));
}

/**
 * Case assignments are stored against User IDs, while the roster is the
 * authoritative source for who currently holds an attorney position. Ensure
 * active attorneys have a permissionless User row so they can be assigned
 * before their first portal login. Their normal login later updates that row.
 */
export async function getDivisionCaseAssignees(
  division: string | null | undefined,
  options: { divisionGroup?: string | null; restrictToGroup?: boolean } = {},
): Promise<{ id: string; displayName: string }[]> {
  const entries = await prisma.rosterEntry.findMany({
    where: {
      isActive: true,
      ...(division ? { unit: division } : {}),
      rank: { in: [...ASSIGNABLE_ATTORNEY_RANKS] },
      ...(options.restrictToGroup ? { divisionGroup: options.divisionGroup ?? "__no_group__" } : {}),
    },
    select: { name: true, rank: true, robloxUserId: true, discordUserId: true, unit: true, divisionGroup: true },
    orderBy: { name: "asc" },
  });

  const assignees = new Map<string, { id: string; displayName: string }>();
  for (const entry of entries) {
    if (!isAssignableAttorneyRank(entry.rank)) continue;
    if (!entry.robloxUserId && !entry.discordUserId) continue;

    const byRoblox = entry.robloxUserId
      ? await prisma.user.findUnique({ where: { robloxUserId: entry.robloxUserId } })
      : null;
    const byDiscord = !byRoblox && entry.discordUserId
      ? await prisma.user.findUnique({ where: { discordUserId: entry.discordUserId } })
      : null;
    const existing = byRoblox ?? byDiscord;
    const divisionData = { division: entry.unit, divisionGroup: entry.divisionGroup };

    let user;
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...divisionData,
          ...(entry.robloxUserId && !existing.robloxUserId ? { robloxUserId: entry.robloxUserId } : {}),
        },
      });
    } else {
      try {
        user = await prisma.user.create({
          data: {
            username: entry.name,
            displayName: entry.name,
            tiers: "",
            ...divisionData,
            ...(entry.robloxUserId ? { robloxUserId: entry.robloxUserId } : {}),
            ...(entry.discordUserId ? { discordUserId: entry.discordUserId } : {}),
          },
        });
      } catch (error) {
        // Another request may have materialized this roster entry at the same time.
        const racedUser = entry.robloxUserId
          ? await prisma.user.findUnique({ where: { robloxUserId: entry.robloxUserId } })
          : entry.discordUserId
            ? await prisma.user.findUnique({ where: { discordUserId: entry.discordUserId } })
            : null;
        if (!racedUser) throw error;
        user = await prisma.user.update({ where: { id: racedUser.id }, data: divisionData });
      }
    }

    assignees.set(user.id, { id: user.id, displayName: user.displayName || entry.name });
  }

  return [...assignees.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

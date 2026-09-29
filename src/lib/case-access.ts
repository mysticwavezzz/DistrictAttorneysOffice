import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import type { PermissionTier } from "@/lib/permissions/tiers";

export async function localUser(discordUserId: string) {
  return prisma.user.findUnique({ where: { discordUserId } });
}

export function canAccessCase(
  tiers: PermissionTier[],
  userId: string,
  target: { assignedAttorneyId: string | null; createdById: string }
): boolean {
  if (hasCapability(tiers, CAPABILITIES.CASES_VIEW_ALL)) return true;
  return target.assignedAttorneyId === userId || target.createdById === userId;
}

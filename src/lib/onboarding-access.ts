import "server-only";

import { prisma } from "@/lib/prisma";
import { PERMISSION_TIERS, type PermissionTier } from "@/lib/permissions/tiers";
import { isAssignableAttorneyRank } from "@/lib/case-assignees";
import { effectiveRosterRank } from "@/lib/staff-rank-control";

/** Apply persisted onboarding restrictions to server-rendered portal layouts and pages. */
export async function getOnboardingAccessTiers(robloxUserId: string | null | undefined, fallback: PermissionTier[]): Promise<PermissionTier[]> {
  if (!robloxUserId) return fallback;
  const roster = await prisma.rosterEntry.findUnique({ where: { robloxUserId }, select: { isActive: true, unit: true, rank: true, rankOverride: true, isProsecutorInTraining: true, orientationPending: true, orientationAcknowledgedAt: true } });
  if (!roster?.isActive) return fallback;
  if (roster.isProsecutorInTraining) return [PERMISSION_TIERS.PROSECUTOR_IN_TRAINING];
  const orientationRequired = roster.unit === "Criminal Division" && isAssignableAttorneyRank(effectiveRosterRank(roster.rank, roster.rankOverride)) && !roster.orientationAcknowledgedAt;
  if (roster.orientationPending || orientationRequired) return [PERMISSION_TIERS.ATTORNEY_ORIENTATION_PENDING];
  return fallback;
}

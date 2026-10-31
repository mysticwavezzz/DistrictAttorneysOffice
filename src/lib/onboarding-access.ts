import "server-only";

import { prisma } from "@/lib/prisma";
import { PERMISSION_TIERS, type PermissionTier } from "@/lib/permissions/tiers";
import { isCriminalDivisionTrainee, requiresCriminalDivisionOrientation } from "@/lib/onboarding-policy";

/** Apply persisted onboarding restrictions to server-rendered portal layouts and pages. */
export async function getOnboardingAccessTiers(robloxUserId: string | null | undefined, fallback: PermissionTier[]): Promise<PermissionTier[]> {
  if (!robloxUserId) return fallback;
  const roster = await prisma.rosterEntry.findUnique({ where: { robloxUserId }, select: { isActive: true, unit: true, rank: true, rankOverride: true, isProsecutorInTraining: true, orientationPending: true, orientationAcknowledgedAt: true } });
  if (!roster?.isActive) return fallback;
  if (isCriminalDivisionTrainee(roster)) return [PERMISSION_TIERS.PROSECUTOR_IN_TRAINING];
  if (requiresCriminalDivisionOrientation(roster)) return [PERMISSION_TIERS.ATTORNEY_ORIENTATION_PENDING];
  return fallback;
}

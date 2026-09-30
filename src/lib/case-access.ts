import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import type { PermissionTier } from "@/lib/permissions/tiers";

export async function localUser(identity: { identityProvider: "discord" | "roblox"; providerUserId: string }) {
  if (!identity.providerUserId) return null;
  return identity.identityProvider === "roblox"
    ? prisma.user.findUnique({ where: { robloxUserId: identity.providerUserId } })
    : prisma.user.findUnique({ where: { discordUserId: identity.providerUserId } });
}

export function canAccessCase(
  tiers: PermissionTier[],
  userId: string,
  target: { assignedAttorneyId: string | null; createdById: string; isDraft?: boolean }
): boolean {
  const canViewAll = hasCapability(tiers, CAPABILITIES.CASES_VIEW_ALL);
  if (target.isDraft) {
    return target.createdById === userId || canViewAll;
  }
  if (canViewAll) return true;
  return target.assignedAttorneyId === userId || target.createdById === userId;
}

export async function generateCaseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DA-${year}-`;
  const latest = await prisma.case.findFirst({
    where: { caseNumber: { startsWith: prefix } },
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true },
  });

  let next = 1;
  if (latest) {
    const suffix = latest.caseNumber.slice(prefix.length);
    const parsed = parseInt(suffix, 10);
    if (!Number.isNaN(parsed)) next = parsed + 1;
  }

  let candidate = `${prefix}${String(next).padStart(4, "0")}`;
  while (await prisma.case.findUnique({ where: { caseNumber: candidate } })) {
    next += 1;
    candidate = `${prefix}${String(next).padStart(4, "0")}`;
  }
  return candidate;
}

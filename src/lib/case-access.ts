import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import type { PermissionTier } from "@/lib/permissions/tiers";
import type { Prisma } from "@prisma/client";

export async function localUser(identity: { identityProvider: "discord" | "roblox"; providerUserId: string }) {
  if (!identity.providerUserId) return null;
  if (identity.identityProvider !== "roblox") return prisma.user.findUnique({ where: { discordUserId: identity.providerUserId } });
  const user = await prisma.user.findUnique({ where: { robloxUserId: identity.providerUserId } });
  if (!user) return null;
  const rosterEntry = await prisma.rosterEntry.findUnique({ where: { robloxUserId: identity.providerUserId }, select: { unit: true, divisionGroup: true } });
  const division = rosterEntry ? rosterEntry.unit : user.division;
  const divisionGroup = rosterEntry ? rosterEntry.divisionGroup : user.divisionGroup;
  if (user.division !== division || user.divisionGroup !== divisionGroup) return prisma.user.update({ where: { id: user.id }, data: { division, divisionGroup } });
  return user;
}

export function canAccessCase(
  tiers: PermissionTier[],
  userId: string,
  target: { assignedAttorneyId: string | null; createdById: string; isDraft?: boolean; division?: string | null; divisionGroup?: string | null },
  userDivision?: string | null,
  userGroup?: string | null
): boolean {
  const canViewAll = hasCapability(tiers, CAPABILITIES.CASES_VIEW_ALL);
  const isSada = tiers.includes("senior_assistant_district_attorney") && !canViewAll;
  if (isSada && target.division !== userDivision) return false;
  if (isSada && target.division === "Criminal Division" && (!userGroup || target.divisionGroup !== userGroup)) return false;
  const canViewDivision = hasCapability(tiers, CAPABILITIES.CASES_VIEW_DIVISION) && Boolean(userDivision) && target.division === userDivision;
  if (target.isDraft) {
    return target.createdById === userId || canViewAll || canViewDivision;
  }
  if (canViewAll || canViewDivision) return true;
  return target.assignedAttorneyId === userId || target.createdById === userId;
}

export function canViewCases(tiers: PermissionTier[]): boolean {
  return hasCapability(tiers, CAPABILITIES.CASES_VIEW) || hasCapability(tiers, CAPABILITIES.CASES_VIEW_DIVISION);
}

export function canEditCase(tiers: PermissionTier[], userDivision: string | null | undefined, caseDivision: string | null | undefined): boolean {
  return hasCapability(tiers, CAPABILITIES.CASES_EDIT) || (Boolean(userDivision) && userDivision === caseDivision && hasCapability(tiers, CAPABILITIES.CASES_EDIT_DIVISION));
}

export function canAssignCase(tiers: PermissionTier[], userDivision: string | null | undefined, caseDivision?: string | null): boolean {
  return hasCapability(tiers, CAPABILITIES.CASES_ASSIGN) || (Boolean(userDivision) && (!caseDivision || userDivision === caseDivision) && hasCapability(tiers, CAPABILITIES.CASES_ASSIGN_DIVISION));
}

export function canReviewDivision(tiers: PermissionTier[], userDivision: string | null | undefined, requestDivision?: string | null, userGroup?: string | null, requestGroup?: string | null): boolean {
  if (hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS)) return true;
  if (!userDivision || !requestDivision || userDivision !== requestDivision || !hasCapability(tiers, CAPABILITIES.CASES_APPROVE_DIVISION)) return false;
  if (tiers.includes("senior_assistant_district_attorney") && requestDivision === "Criminal Division") return Boolean(userGroup && requestGroup && userGroup === requestGroup);
  return true;
}

export function canManageRosterInDivision(tiers: PermissionTier[], userDivision: string | null | undefined, targetDivision?: string | null): boolean {
  return hasCapability(tiers, CAPABILITIES.ROSTER_MANAGE) || (Boolean(userDivision) && userDivision === targetDivision && hasCapability(tiers, CAPABILITIES.ROSTER_MANAGE_DIVISION));
}

export function canManageUnassignedRosterEntry(tiers: PermissionTier[], userDivision: string | null | undefined, targetDivision: string | null | undefined, targetRank: string | null | undefined): boolean {
  const officeWideRanks = new Set(["District Attorney", "Deputy District Attorney", "Chief of Staff"]);
  return !hasCapability(tiers, CAPABILITIES.ROSTER_MANAGE)
    && hasCapability(tiers, CAPABILITIES.ROSTER_MANAGE_DIVISION)
    && Boolean(userDivision)
    && !targetDivision
    && !officeWideRanks.has(targetRank ?? "");
}

/** SADA group leads may only place ungrouped Criminal Division staff into their own group. */
export function canManageCriminalGroupRosterEntry(
  tiers: PermissionTier[],
  userDivision: string | null | undefined,
  userGroup: string | null | undefined,
  targetDivision: string | null | undefined,
  targetGroup: string | null | undefined
): boolean {
  if (hasCapability(tiers, CAPABILITIES.ROSTER_MANAGE) || hasCapability(tiers, CAPABILITIES.ROSTER_MANAGE_DIVISION)) return true;
  return tiers.includes("senior_assistant_district_attorney")
    && hasCapability(tiers, CAPABILITIES.CASES_APPROVE_DIVISION)
    && userDivision === "Criminal Division"
    && Boolean(userGroup)
    && targetDivision === "Criminal Division"
    && (!targetGroup || targetGroup === userGroup);
}

/** Build a safe list scope. A missing local identity must never become an unscoped docket query. */
export function caseVisibilityWhere(
  tiers: PermissionTier[],
  userId: string | null | undefined,
  userDivision?: string | null,
  userGroup?: string | null
): Prisma.CaseWhereInput | null {
  if (hasCapability(tiers, CAPABILITIES.CASES_VIEW_ALL)) return {};
  if (!userId) return null;
  const ownershipScopes: Prisma.CaseWhereInput[] = [{ assignedAttorneyId: userId }, { createdById: userId }];
  const ownership: Prisma.CaseWhereInput = { OR: ownershipScopes };
  const isSada = tiers.includes("senior_assistant_district_attorney") && !hasCapability(tiers, CAPABILITIES.CASES_VIEW_ALL);
  const scopes: Prisma.CaseWhereInput[] = isSada ? [{
    AND: [ownership, { division: userDivision ?? "__no_division__" }, ...(userDivision === "Criminal Division" ? [{ OR: [
      ...(userGroup ? [{ divisionGroup: userGroup }, { divisionGroup: null, assignedAttorney: { divisionGroup: userGroup } }, { divisionGroup: null, createdBy: { divisionGroup: userGroup } }] : []),
    ] }] : [])],
  }] : [...ownershipScopes];
  if (userDivision && hasCapability(tiers, CAPABILITIES.CASES_VIEW_DIVISION)) {
    if (tiers.includes("senior_assistant_district_attorney") && userDivision === "Criminal Division") {
      if (userGroup) scopes.push({ division: userDivision, OR: [
        { divisionGroup: userGroup },
        { divisionGroup: null, assignedAttorney: { divisionGroup: userGroup } },
        { divisionGroup: null, createdBy: { divisionGroup: userGroup } },
      ] });
    } else {
      scopes.push({ division: userDivision });
    }
  }
  return { OR: scopes };
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

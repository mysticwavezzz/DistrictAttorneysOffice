import type { Prisma } from "@prisma/client";
import type { PermissionTier } from "@/lib/permissions/tiers";
import { caseVisibilityWhere } from "@/lib/case-access";
import { normalizeExactCaseNumber } from "@/lib/case-number-search";

export function caseDocketWhere(input: {
  tiers: PermissionTier[];
  viewerId: string;
  viewerDivision: string | null;
  viewerGroup: string | null;
  ownerId: string | null;
  tab: "ongoing" | "archived";
  q: string;
  status: string;
  filingStatus: string;
  reviewOnly: boolean;
}): Prisma.CaseWhereInput | null {
  const visibility = caseVisibilityWhere(input.tiers, input.viewerId, input.viewerDivision, input.viewerGroup);
  if (!visibility) return null;
  const exactCaseNumber = normalizeExactCaseNumber(input.q);
  const conditions: Prisma.CaseWhereInput[] = [visibility];
  if (input.ownerId) conditions.push({ assignedAttorneyId: input.ownerId });
  if (exactCaseNumber) conditions.push({ caseNumber: exactCaseNumber });
  else {
    conditions.push({ archived: input.tab === "archived" });
    if (input.q) conditions.push({ OR: [
      { title: { contains: input.q } },
      { caseNumber: { contains: input.q } },
      { assignedAttorney: { displayName: { contains: input.q } } },
    ] });
  }
  if (input.status) conditions.push({ stage: input.status });
  if (input.filingStatus === "filed") conditions.push({ courtFiledAt: { not: null } });
  if (["unfiled", "pending", "approved", "returned"].includes(input.filingStatus)) conditions.push({ courtFiledAt: null });
  if (input.filingStatus === "pending") conditions.push({ filings: { some: { isInitial: true, status: "PENDING" } } });
  if (input.filingStatus === "approved") conditions.push({ filings: { some: { isInitial: true, status: "ACCEPTED" } } });
  if (input.filingStatus === "returned") conditions.push({ filings: { some: { isInitial: true, status: "REJECTED" } } });
  if (input.reviewOnly) conditions.push({ OR: [
    { actionRequests: { some: { status: "PENDING" } } },
    { filings: { some: { status: "PENDING" } } },
  ] });
  return { AND: conditions };
}

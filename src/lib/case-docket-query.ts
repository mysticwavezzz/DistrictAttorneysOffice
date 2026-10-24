import type { Prisma } from "@prisma/client";
import type { PermissionTier } from "@/lib/permissions/tiers";
import { caseVisibilityWhere } from "@/lib/case-access";
import { normalizeExactCaseNumber } from "@/lib/case-number-search";
import { prisma } from "@/lib/prisma";
import { getProceduralDeadlines, isCourtDeadlineOverdue } from "@/lib/procedural-deadlines";

export function caseDocketWhere(input: {
  tiers: PermissionTier[];
  viewerId: string;
  viewerDivision: string | null;
  viewerGroup: string | null;
  ownerId: string | null;
  tab: "ongoing" | "archived";
  q: string;
  status: string;
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
  if (input.reviewOnly) conditions.push({ OR: [
    { actionRequests: { some: { status: "PENDING" } } },
    { filings: { some: { status: "PENDING" } } },
  ] });
  return { AND: conditions };
}

export async function withOverdueCaseFilter(where: Prisma.CaseWhereInput, now = new Date()): Promise<Prisma.CaseWhereInput> {
  const candidates = await prisma.case.findMany({ where, select: {
    id: true, type: true, createdAt: true, assignedJudge: true, courtFiledAt: true,
    initialFilingDue: true, discDue: true, pretrial: true, appealBy: true, arraignmentAt: true,
    proofOfServiceAt: true, discoveryOrderAt: true, discoveryRequestedAt: true,
    motionServedAt: true, verdictAt: true, sentenceAt: true, finalJudgmentAt: true,
  } });
  const ids = candidates.filter((item) => getProceduralDeadlines(item).some((deadline) => isCourtDeadlineOverdue(deadline.dueDate, now))).map((item) => item.id);
  return { AND: [where, { id: { in: ids } }] };
}

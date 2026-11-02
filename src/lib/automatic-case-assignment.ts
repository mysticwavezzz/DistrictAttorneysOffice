import { prisma } from "@/lib/prisma";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";
import { buildAssignmentContext, recommendCaseAssignees } from "@/lib/case-assignment-recommendations";

export async function automaticallyAssignCase(input: {
  division?: string | null;
  divisionGroup?: string | null;
  restrictToGroup?: boolean;
  type?: string | null;
  stage?: string | null;
}) {
  const candidates = await getDivisionCaseAssignees(input.division, { divisionGroup: input.divisionGroup, restrictToGroup: input.restrictToGroup });
  if (!candidates.length) throw new Error(`No active eligible attorney is available for ${input.division || "this office"}. Add an attorney to the active roster before opening the case.`);
  const [activeCases, caseHistory] = await Promise.all([
    prisma.case.findMany({
      where: { archived: false, isDraft: false, ...(input.division ? { division: input.division } : {}) },
      select: { id: true, assignedAttorneyId: true, type: true, stage: true, initialFilingDue: true, discDue: true, pretrial: true, appealBy: true, arraignmentAt: true, proofOfServiceAt: true, discoveryOrderAt: true, discoveryRequestedAt: true, motionServedAt: true, verdictAt: true, sentenceAt: true, finalJudgmentAt: true, courtFiledAt: true },
      take: 5000,
    }),
    prisma.case.findMany({
      where: { isDraft: false, ...(input.division ? { division: input.division } : {}) },
      select: { assignedAttorneyId: true, type: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
  ]);
  const now = new Date();
  const context = buildAssignmentContext(candidates, activeCases, caseHistory, now);
  const recommended = recommendCaseAssignees({ type: input.type ?? null, stage: input.stage ?? null }, context)[0];
  if (!recommended) throw new Error("Automatic assignment could not find an eligible attorney.");
  return { attorney: recommended, reason: recommended.reason };
}

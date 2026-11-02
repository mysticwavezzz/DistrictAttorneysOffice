export type AssignmentLoadCase = {
  id: string;
  assignedAttorneyId: string | null;
  type: string | null;
  stage: string | null;
};

export type AssignmentCandidate = {
  id: string;
  displayName: string;
  rank: string | null;
  divisionGroup: string | null;
};

export type AssignmentHistoryCase = {
  assignedAttorneyId: string | null;
  type: string | null;
};

type CandidateLoad = AssignmentCandidate & {
  activeCases: number;
  weightedLoad: number;
  caseTypeCounts: Map<string, number>;
};

export type AssignmentContext = { candidates: CandidateLoad[]; now: Date };

export type AssignmentRecommendation = AssignmentCandidate & {
  activeCases: number;
  weightedLoad: number;
  similarCases: number;
  score: number;
  reason: string;
};

const ADVANCED_STAGES = new Set(["trial", "sentencing", "appeal"]);
const STAGE_LOAD: Record<string, number> = {
  intake: 0.8,
  investigation: 1,
  pretrial: 1.2,
  trial: 1.55,
  sentencing: 1.35,
  appeal: 1.45,
};

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function rankLevel(rank: string | null): number {
  const value = normalized(rank);
  if (value === "district attorney" || value === "chief assistant district attorney") return 3;
  if (value === "deputy district attorney" || value === "senior assistant district attorney" || value === "supervisory assistant district attorney") return 2;
  return 1;
}

function workloadWeight(record: AssignmentLoadCase): number {
  return STAGE_LOAD[normalized(record.stage)] ?? 1;
}

export function buildAssignmentContext(
  candidates: AssignmentCandidate[],
  activeCases: AssignmentLoadCase[],
  caseHistory: AssignmentHistoryCase[],
  now = new Date(),
): AssignmentContext {
  const activeByAttorney = new Map<string, AssignmentLoadCase[]>();
  for (const record of activeCases) {
    if (!record.assignedAttorneyId) continue;
    const rows = activeByAttorney.get(record.assignedAttorneyId) ?? [];
    rows.push(record);
    activeByAttorney.set(record.assignedAttorneyId, rows);
  }
  const historyByAttorney = new Map<string, Map<string, number>>();
  for (const record of caseHistory) {
    const type = normalized(record.type);
    if (!record.assignedAttorneyId || !type) continue;
    const counts = historyByAttorney.get(record.assignedAttorneyId) ?? new Map<string, number>();
    counts.set(type, (counts.get(type) ?? 0) + 1);
    historyByAttorney.set(record.assignedAttorneyId, counts);
  }
  const candidateLoads: CandidateLoad[] = candidates.map((candidate) => {
    const cases = activeByAttorney.get(candidate.id) ?? [];
    const metrics = cases.reduce((total, record) => {
      total.weightedLoad += workloadWeight(record);
      return total;
    }, { weightedLoad: 0 });
    return {
      ...candidate,
      activeCases: cases.length,
      ...metrics,
      caseTypeCounts: historyByAttorney.get(candidate.id) ?? new Map<string, number>(),
    };
  });
  return { candidates: candidateLoads, now };
}

export function recommendCaseAssignees(
  target: Pick<AssignmentLoadCase, "type" | "stage">,
  context: AssignmentContext,
): AssignmentRecommendation[] {
  const type = normalized(target.type);
  const advanced = ADVANCED_STAGES.has(normalized(target.stage));
  return context.candidates.map((candidate) => {
    const similarCases = type ? candidate.caseTypeCounts.get(type) ?? 0 : 0;
    const experienceCredit = Math.min(0.9, similarCases * 0.2);
    const seniorityCredit = advanced ? (rankLevel(candidate.rank) - 1) * 0.22 : 0;
    const score = candidate.weightedLoad - experienceCredit - seniorityCredit;
    const reasonParts = [
      `${candidate.activeCases} active case${candidate.activeCases === 1 ? "" : "s"}`,
    ];
    if (similarCases) reasonParts.push(`${similarCases} prior case${similarCases === 1 ? "" : "s"} of this type`);
    if (advanced) reasonParts.push(`${candidate.rank ?? "Attorney"} rank considered for ${target.stage}`);
    return {
      id: candidate.id,
      displayName: candidate.displayName,
      rank: candidate.rank,
      divisionGroup: candidate.divisionGroup,
      activeCases: candidate.activeCases,
      weightedLoad: candidate.weightedLoad,
      similarCases,
      score,
      reason: reasonParts.join(" · "),
    };
  }).sort((a, b) => a.score - b.score || a.activeCases - b.activeCases || a.displayName.localeCompare(b.displayName));
}

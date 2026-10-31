import { isAssignableAttorneyRank } from "@/lib/case-assignees";

export const CRIMINAL_DIVISION = "Criminal Division";

export interface OnboardingRosterState {
  isActive: boolean;
  unit: string | null;
  rank: string | null;
  rankOverride?: string | null;
  isProsecutorInTraining?: boolean;
  orientationPending?: boolean;
  orientationAcknowledgedAt?: Date | null;
}

export function effectiveOnboardingRank(roster: Pick<OnboardingRosterState, "rank" | "rankOverride">): string | null {
  return roster.rankOverride || roster.rank;
}

export function isCriminalDivisionEmployee(roster: Pick<OnboardingRosterState, "isActive" | "unit"> | null | undefined): boolean {
  return Boolean(roster?.isActive && roster.unit === CRIMINAL_DIVISION);
}

export function isCriminalDivisionTrainee(roster: OnboardingRosterState | null | undefined): boolean {
  return Boolean(isCriminalDivisionEmployee(roster) && roster?.isProsecutorInTraining);
}

export function requiresCriminalDivisionOrientation(roster: OnboardingRosterState | null | undefined): boolean {
  return Boolean(isCriminalDivisionEmployee(roster)
    && isAssignableAttorneyRank(effectiveOnboardingRank(roster!))
    && (roster?.orientationPending || !roster?.orientationAcknowledgedAt));
}

/** Group placement is for line attorneys. Division and office leadership can acknowledge without a trial-group assignment. */
export function requiresCriminalDivisionGroupForOrientation(rank: string | null | undefined): boolean {
  return rank === "Assistant District Attorney"
    || rank === "Senior Assistant District Attorney"
    || rank === "Supervisory Assistant District Attorney";
}

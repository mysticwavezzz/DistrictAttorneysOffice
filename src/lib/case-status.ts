export const CASE_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "CHARGES_FILED",
  "IN_TRIAL",
  "CLOSED",
  "DISMISSED",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export function isCaseStatus(value: string): value is CaseStatus {
  return (CASE_STATUSES as readonly string[]).includes(value);
}

export function formatCaseStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export const CASE_STATUS_PILL: Record<CaseStatus, string> = {
  OPEN: "pill-navy",
  UNDER_REVIEW: "pill-gold",
  CHARGES_FILED: "pill-navy",
  IN_TRIAL: "pill-red",
  CLOSED: "pill-green",
  DISMISSED: "pill-muted",
};

export type StatusColor = "navy" | "gold" | "green" | "red" | "muted";

export interface CaseStatusOption {
  value: string;
  label: string;
  color: StatusColor;
}

export const CASE_STATUSES: CaseStatusOption[] = [
  { value: "Intake", label: "Intake", color: "muted" },
  { value: "Charges Filed", label: "Charges Filed", color: "navy" },
  { value: "Discovery", label: "Discovery", color: "navy" },
  { value: "Plea Negotiation", label: "Plea Negotiation", color: "gold" },
  { value: "Pretrial", label: "Pretrial", color: "gold" },
  { value: "Trial", label: "Trial", color: "red" },
  { value: "Continued", label: "Continued", color: "muted" },
  { value: "Closed - Convicted", label: "Closed – Convicted", color: "green" },
  { value: "Closed - Plea Agreement", label: "Closed – Plea Agreement", color: "green" },
  { value: "Closed - Dismissed", label: "Closed – Dismissed", color: "muted" },
  { value: "Closed - Acquitted", label: "Closed – Acquitted", color: "red" },
  { value: "Appeal", label: "Appeal", color: "gold" },
];

export const CASE_STATUS_VALUES = CASE_STATUSES.map((s) => s.value) as [string, ...string[]];

export function caseStatusColor(value: string | null | undefined): StatusColor {
  return CASE_STATUSES.find((s) => s.value === value)?.color ?? "muted";
}

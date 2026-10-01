import { z } from "zod";

const optionalText = z.string().trim().optional().or(z.literal(""));

export const caseInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  caseNumber: z.string().trim().max(50).optional().or(z.literal("")),
  type: optionalText,
  assignedJudge: z.string().trim().max(120).optional().or(z.literal("")),
  stage: optionalText,
  disclosures: z.string().trim().max(2000).optional().or(z.literal("")),
  discGiven: optionalText,
  discDue: optionalText,
  pretrial: optionalText,
  otherDates: z.string().trim().max(500).optional().or(z.literal("")),
  outcome: z.string().trim().max(500).optional().or(z.literal("")),
  closedOn: optionalText,
  appealBy: optionalText,
  arraignmentAt: optionalText,
  proofOfServiceAt: optionalText,
  discoveryOrderAt: optionalText,
  discoveryRequestedAt: optionalText,
  motionServedAt: optionalText,
  verdictAt: optionalText,
  sentenceAt: optionalText,
  finalJudgmentAt: optionalText,
  summary: z.string().trim().max(4000).optional().or(z.literal("")),
  assignedAttorneyId: optionalText,
});

export type CaseInput = z.infer<typeof caseInputSchema>;

export function emptyToNull(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toDate(value: string | undefined): Date | null {
  const text = emptyToNull(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

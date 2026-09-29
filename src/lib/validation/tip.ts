import { z } from "zod";

export const tipFormSchema = z.object({
  submitterRoblox: z.string().trim().min(2).max(120),
  submitterDiscord: z.string().trim().min(2).max(120),
  legalAcknowledgment: z.literal(true),
  crimeType: z.string().trim().min(1).max(120),
  crimeTypeOther: z.string().trim().max(120).optional().default(""),
  incidentDateTime: z.string().trim().min(1).max(60),
  location: z.string().trim().min(2).max(300),
  suspectRoblox: z.string().trim().min(2).max(120),
  suspectDiscord: z.string().trim().min(2).max(120),
  suspectInformation: z.string().trim().min(2).max(2000),
  narrative: z.string().trim().min(20).max(8000),
  evidence: z.string().trim().min(2).max(2000),
  witnesses: z.string().trim().min(2).max(2000),
  identityWaiver: z.literal(true),
  truthAffirmation: z.literal(true),
  signature: z.string().trim().min(2).max(120).regex(/^[A-Z0-9_ ]+$/, "Enter your Roblox username in uppercase letters."),
  submissionReference: z.string().regex(/^HCD-[A-Z0-9]+-[A-Z0-9]{6}$/),
  website: z.string().max(0).optional().default(""),
  renderedAt: z.number().int().positive(),
});

export type TipFormInput = z.infer<typeof tipFormSchema>;

import { z } from "zod";

export const tipFormSchema = z.object({
  name: z.string().trim().max(100).optional().default(""),
  contact: z.string().trim().max(200).optional().default(""),
  location: z.string().trim().max(200).optional().default(""),
  details: z
    .string()
    .trim()
    .min(20, "Please provide at least 20 characters of detail.")
    .max(4000, "Please keep your tip under 4000 characters."),
  // Honeypot field: real users never see or fill this (hidden via CSS).
  // Any non-empty value here marks the submission as automated.
  website: z.string().max(0).optional().default(""),
  // Timestamp (ms) the form was rendered, echoed back on submit so the
  // server can reject submissions completed implausibly fast for a human.
  renderedAt: z.number().int().positive(),
});

export type TipFormInput = z.infer<typeof tipFormSchema>;

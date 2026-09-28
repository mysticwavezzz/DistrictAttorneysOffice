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
  website: z.string().max(0).optional().default(""),
  renderedAt: z.number().int().positive(),
});

export type TipFormInput = z.infer<typeof tipFormSchema>;

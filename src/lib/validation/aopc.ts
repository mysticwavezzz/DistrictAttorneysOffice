import { z } from "zod";

export const aopcInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  targetUnit: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  narrative: z.string().trim().min(1, "Narrative is required").max(8000),
});

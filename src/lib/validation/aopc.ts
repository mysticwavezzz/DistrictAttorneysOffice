import { z } from "zod";
import { AOPC_TARGET_UNITS } from "@/config/units";

export const aopcInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  targetUnit: z.enum(AOPC_TARGET_UNITS as [string, ...string[]]),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  narrative: z.string().trim().min(1, "Narrative is required").max(8000),
});

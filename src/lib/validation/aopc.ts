import { z } from "zod";

export const aopcInputSchema = z.object({
  reportId: z.string().trim().min(1, "Report ID is required").max(100),
  targetUnit: z.string().trim().min(1).max(100),
  documentUrl: z.string().trim().max(2000).optional().default("").refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a valid HTTP or HTTPS link."),
});

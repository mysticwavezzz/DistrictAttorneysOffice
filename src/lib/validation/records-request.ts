import { z } from "zod";

export const recordsRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  contact: z.string().trim().min(1, "Contact info is required").max(200),
  details: z.string().trim().min(1, "Please describe the records you're requesting").max(2000),
});

import { z } from "zod";

export const caseFilingSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  url: z
    .string()
    .trim()
    .min(1, "URL is required")
    .max(2000)
    .refine((value) => /^https?:\/\//i.test(value), {
      message: "URL must start with http:// or https://",
    }),
});

export const caseCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(4000),
});

import { z } from "zod";

export const caseFilingSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
});

export const caseCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(4000),
});

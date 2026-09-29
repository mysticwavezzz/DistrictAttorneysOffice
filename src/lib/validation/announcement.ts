import { z } from "zod";
import { ANNOUNCEMENT_AUDIENCES } from "@/lib/announcement-audience";

export const announcementInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  summary: z.string().trim().max(300).optional().or(z.literal("")),
  body: z.string().trim().min(1, "Body is required").max(8000),
  imageUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => value === "" || /^https?:\/\//i.test(value), {
      message: "Image URL must start with http:// or https://",
    })
    .optional()
    .or(z.literal("")),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
});

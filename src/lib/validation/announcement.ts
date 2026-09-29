import { z } from "zod";
import { ANNOUNCEMENT_AUDIENCES } from "@/lib/announcement-audience";

export const announcementInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(8000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
});

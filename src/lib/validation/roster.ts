import { z } from "zod";

export const rosterEntrySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  position: z.string().trim().min(1, "Position is required").max(100),
  rank: z.string().trim().max(100).optional().or(z.literal("")),
  unit: z.string().trim().max(100).optional().or(z.literal("")),
  discordUserId: z.string().trim().max(50).optional().or(z.literal("")),
  badgeNumber: z.string().trim().max(30).optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  imageUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => value === "" || /^https?:\/\//i.test(value), {
      message: "Image URL must start with http:// or https://",
    })
    .optional()
    .or(z.literal("")),
  about: z.string().trim().max(2000).optional().or(z.literal("")),
});

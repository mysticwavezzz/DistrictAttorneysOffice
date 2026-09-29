export const ANNOUNCEMENT_AUDIENCES = ["PUBLIC", "LAW_ENFORCEMENT"] as const;

export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export function isAnnouncementAudience(value: string): value is AnnouncementAudience {
  return (ANNOUNCEMENT_AUDIENCES as readonly string[]).includes(value);
}

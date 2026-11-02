import { getSiteConfiguration } from "@/lib/site-settings";

export const WEEKLY_REPORT_METRICS_KEY = "publicWeeklyReportPostConvictionMetrics";

export type WeeklyReportPostConvictionMetrics = {
  weekStart: string;
  expungementsContested: number;
  expungementsProcessed: number;
  vacaturRequestsIssued: number;
  vacaturRequestsProcessed: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export function getWeekStartKey(date = new Date()): string {
  const monday = new Date(date);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

const emptyMetrics = (weekStart = getWeekStartKey()): WeeklyReportPostConvictionMetrics => ({
  weekStart,
  expungementsContested: 0,
  expungementsProcessed: 0,
  vacaturRequestsIssued: 0,
  vacaturRequestsProcessed: 0,
  updatedAt: null,
  updatedBy: null,
});

export async function getWeeklyReportPostConvictionMetrics(weekStart = getWeekStartKey()) {
  const stored = await getSiteConfiguration<Partial<WeeklyReportPostConvictionMetrics> | null>(WEEKLY_REPORT_METRICS_KEY, null);
  if (!stored || stored.weekStart !== weekStart) return emptyMetrics(weekStart);
  return {
    weekStart,
    expungementsContested: Number.isSafeInteger(stored.expungementsContested) && Number(stored.expungementsContested) >= 0 ? Number(stored.expungementsContested) : 0,
    expungementsProcessed: Number.isSafeInteger(stored.expungementsProcessed) && Number(stored.expungementsProcessed) >= 0 ? Number(stored.expungementsProcessed) : 0,
    vacaturRequestsIssued: Number.isSafeInteger(stored.vacaturRequestsIssued) && Number(stored.vacaturRequestsIssued) >= 0 ? Number(stored.vacaturRequestsIssued) : 0,
    vacaturRequestsProcessed: Number.isSafeInteger(stored.vacaturRequestsProcessed) && Number(stored.vacaturRequestsProcessed) >= 0 ? Number(stored.vacaturRequestsProcessed) : 0,
    updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : null,
    updatedBy: typeof stored.updatedBy === "string" ? stored.updatedBy : null,
  } satisfies WeeklyReportPostConvictionMetrics;
}

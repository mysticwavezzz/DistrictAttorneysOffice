import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { AnnouncementsSection, type AnnouncementListItem } from "@/components/announcements-section";
import { TipsSection } from "@/components/tips-section";
import { WeeklyReportSection, type WeeklyReportData } from "@/components/weekly-report-section";
import { shareMetadata } from "@/lib/share-metadata";

export const metadata = shareMetadata(`${siteConfig.county} ${siteConfig.name}`, siteConfig.tagline, "/");

async function getPublishedAnnouncements(): Promise<AnnouncementListItem[]> {
  try {
    return await prisma.announcement.findMany({
      where: { isPublished: true, audience: "PUBLIC", publishedAt: { lte: new Date() } },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        summary: true,
        body: true,
        imageUrl: true,
        publishedAt: true,
      },
    });
  } catch (error) {
    console.error("Failed to load announcements", error);
    return [];
  }
}

async function getWeeklyReport(): Promise<WeeklyReportData | null> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);

  const dateLabel = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);

  try {
    const [newMatters, courtFilings, closedMatters, activeMatters] = await Promise.all([
      prisma.case.count({
        where: { createdAt: { gte: weekStart, lte: now }, archived: false, isDraft: false },
      }),
      prisma.caseFiling.count({
        where: {
          filedAt: { gte: weekStart, lte: now },
          status: "ACCEPTED",
          case: { is: { isDraft: false } },
        },
      }),
      prisma.case.count({ where: { closedOn: { gte: weekStart, lte: now }, isDraft: false } }),
      prisma.case.count({ where: { archived: false, isDraft: false, closedOn: null } }),
    ]);

    return {
      period: `${dateLabel(weekStart)} – ${dateLabel(now)}`,
      updatedDate: dateLabel(now),
      summary:
        "A weekly count of activity recorded in the office case system. Case names and other identifying details are not included.",
      metrics: [
        { label: "New matters", value: String(newMatters), detail: "Opened this week" },
        { label: "Filed with the Court", value: String(courtFilings), detail: "Court filing date recorded" },
        { label: "Matters closed", value: String(closedMatters), detail: "Closure date recorded this week" },
        { label: "Active matters", value: String(activeMatters), detail: "Current open docket" },
      ],
    };
  } catch (error) {
    console.error("Failed to load weekly office report", error);
    return null;
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string | string[] }>;
}) {
  const announcements = await getPublishedAnnouncements();
  const params = await searchParams;
  const simulatedPreview: WeeklyReportData | null =
    process.env.NODE_ENV === "development" && params.preview === "weekly-report"
      ? {
          period: "October 26 – November 1, 2026",
          updatedDate: "November 1, 2026",
          summary: "Sample activity for this preview. No case details are shown.",
          metrics: [
            { label: "New matters", value: "14", detail: "Received this week" },
            { label: "Filed with the Court", value: "9", detail: "Internal approvals excluded" },
            { label: "Matters closed", value: "4", detail: "Closure date recorded this week" },
            { label: "Active matters", value: "21", detail: "Sample open docket" },
          ],
          simulated: true,
        }
      : null;
  const weeklyReport = simulatedPreview ?? await getWeeklyReport();

  return (
    <div className="wrap">
      <a href="#main" className="skiplink">
        Skip to main content
      </a>

      <SiteHeader />

      <div className="body">
        <Sidebar />

        <main className="paper" id="main">
          <p className="eyebrow">{siteConfig.county}</p>
          <h1>{siteConfig.name}</h1>
          <p className="subtitle">{siteConfig.tagline}</p>
          <p className="lede">
            The {siteConfig.name} prosecutes criminal cases on behalf of {siteConfig.county},
            working alongside law enforcement to pursue justice fairly, ethically, and
            transparently for every resident.
          </p>

          {weeklyReport && <WeeklyReportSection report={weeklyReport} />}

          <AnnouncementsSection announcements={announcements} />

          <TipsSection />
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

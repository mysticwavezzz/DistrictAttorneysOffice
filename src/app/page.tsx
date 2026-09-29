import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { AnnouncementsSection, type AnnouncementListItem } from "@/components/announcements-section";
import { TipsSection } from "@/components/tips-section";

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

export default async function HomePage() {
  const announcements = await getPublishedAnnouncements();

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

          <AnnouncementsSection announcements={announcements} />

          <TipsSection />
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

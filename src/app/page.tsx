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
      where: { isPublished: true },
      orderBy: { publishedAt: "desc" },
      take: 6,
    });
  } catch (error) {
    // Public home page must render even if the database is unreachable
    // (e.g. before migrations have been run in a fresh environment).
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

          <section id="office-info">
            <h2>Office Information</h2>
            <div className="cards">
              <div className="card">
                <span className="card-label">Phone</span>
                <span className="card-value" style={{ fontSize: 16 }}>
                  {siteConfig.contact.phone}
                </span>
              </div>
              <div className="card">
                <span className="card-label">Email</span>
                <span className="card-value" style={{ fontSize: 14 }}>
                  {siteConfig.contact.email}
                </span>
              </div>
              <div className="card">
                <span className="card-label">Address</span>
                <span className="card-value" style={{ fontSize: 14 }}>
                  {siteConfig.contact.address}
                </span>
              </div>
              <div className="card">
                <span className="card-label">Hours</span>
                <span className="card-value" style={{ fontSize: 14 }}>
                  {siteConfig.hours[0]?.time}
                </span>
                <span className="card-change">{siteConfig.hours[0]?.day}</span>
              </div>
            </div>
            <p className="source">
              Public records requests should be directed to the office&apos;s records desk during
              regular business hours. Certain records may be sealed or exempt from disclosure.
            </p>
          </section>

          <AnnouncementsSection announcements={announcements} />

          <TipsSection />
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

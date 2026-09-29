import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { isLeadershipRank } from "@/config/ranks";

async function getLeadership() {
  try {
    const entries = await prisma.rosterEntry.findMany({ orderBy: { name: "asc" } });
    return entries.filter((e) => isLeadershipRank(e.rank));
  } catch (error) {
    console.error("Failed to load leadership", error);
    return [];
  }
}

export default async function OfficeInfoPage() {
  const leadership = await getLeadership();

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
          <h1>Office Information</h1>

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
            Public records requests should be directed to the office&apos;s records desk.{" "}
            <Link href="/records-request">Submit a records request &rarr;</Link> Certain records
            may be sealed or exempt from disclosure.
          </p>

          <h2>Office Leadership</h2>
          {leadership.length === 0 ? (
            <div className="message">Leadership listings will appear here once published.</div>
          ) : (
            <div className="release-list">
              {leadership.map((entry) => (
                <div key={entry.id} className="release-card" style={{ alignItems: "flex-start" }}>
                  {entry.imageUrl && (
                    <span className="release-card-thumb">
                      <img src={entry.imageUrl} alt="" />
                    </span>
                  )}
                  <span className="release-card-body">
                    <span className="release-card-date">{entry.rank}</span>
                    <span className="release-card-title">{entry.name}</span>
                    {entry.about && <span className="release-card-excerpt">{entry.about}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

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

function formatTenure(startDate: Date | null): string {
  if (!startDate) return "—";
  const now = new Date();
  let months = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
  if (now.getDate() < startDate.getDate()) months -= 1;
  if (months < 1) return "Less than a month";
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${remMonths} mo`;
  if (remMonths === 0) return `${years} yr`;
  return `${years} yr, ${remMonths} mo`;
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
            <div className="tablewrap">
              <table className="stat leadership-table">
                <thead>
                  <tr>
                    <th style={{ width: 64 }} />
                    <th>Name</th>
                    <th>Serving Since</th>
                    <th>About</th>
                  </tr>
                </thead>
                <tbody>
                  {leadership.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <span className="leadership-photo">
                          {entry.imageUrl ? (
                            <img src={entry.imageUrl} alt="" />
                          ) : (
                            <span className="leadership-photo-fallback" aria-hidden="true" />
                          )}
                        </span>
                      </td>
                      <td>
                        <strong>{entry.name}</strong>
                        <br />
                        <span className="note-inline">{entry.rank}</span>
                      </td>
                      <td>{formatTenure(entry.startDate)}</td>
                      <td>{entry.about ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { LEADERSHIP_POSITIONS } from "@/config/units";

type RosterEntry = Awaited<ReturnType<typeof prisma.rosterEntry.findMany>>[number];

async function getLeadershipPositions() {
  try {
    const entries = await prisma.rosterEntry.findMany({ orderBy: { name: "asc" } });
    return LEADERSHIP_POSITIONS.map((position) => ({
      position,
      entry: entries.find((e) => e.rank === position.rank && (position.unit === null || e.unit === position.unit)) ?? null,
    }));
  } catch (error) {
    console.error("Failed to load leadership", error);
    return LEADERSHIP_POSITIONS.map((position) => ({ position, entry: null as RosterEntry | null }));
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
  const positions = await getLeadershipPositions();

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
          <div className="infobox-grid">
            {positions.map(({ position, entry }) => (
              <div key={position.label} className="infobox">
                <div className="infobox-title">{entry ? entry.name : "Vacant"}</div>
                <div className="infobox-photo">
                  {entry?.imageUrl ? (
                    <img src={entry.imageUrl} alt="" />
                  ) : (
                    <span className="infobox-photo-fallback" aria-hidden="true" />
                  )}
                </div>
                <table className="infobox-table">
                  <tbody>
                    <tr>
                      <th>Position</th>
                      <td>{position.label}</td>
                    </tr>
                    {entry ? (
                      <>
                        <tr>
                          <th>Serving Since</th>
                          <td>{formatTenure(entry.startDate)}</td>
                        </tr>
                        {entry.about && (
                          <tr>
                            <th>About</th>
                            <td>{entry.about}</td>
                          </tr>
                        )}
                      </>
                    ) : (
                      <tr>
                        <th>Status</th>
                        <td>
                          <span className="pill pill-muted">Vacant</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

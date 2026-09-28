import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Seal } from "./seal";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="foot">
      <div className="foot-in">
        <div className="fcols">
          <div>
            <h4>Quick Links</h4>
            <ul>
              {siteConfig.nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
              <li>
                <Link href="/login">Staff Login</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>Contact</h4>
            <ul>
              <li>{siteConfig.contact.address}</li>
              <li>{siteConfig.contact.phone}</li>
              <li>{siteConfig.contact.email}</li>
            </ul>
          </div>

          <div>
            <h4>Office Hours</h4>
            <ul>
              {siteConfig.hours.map((h) => (
                <li key={h.day}>
                  {h.day}: {h.time}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>The Office</h4>
            <ul>
              <li>{siteConfig.county} Executive&apos;s Office</li>
              <li>Office of the District Attorney</li>
            </ul>
          </div>
        </div>

        <div className="fbar">
          <div className="seal seal-sm">
            <Seal />
          </div>
          <p className="foot-text" style={{ margin: 0 }}>
            {siteConfig.name}, {siteConfig.county} Executive&apos;s Office (a Roblox roleplay
            community). &copy; {year}. All information on this site is in-character (IC) and
            this site is not affiliated with any real government, county, or agency. No real
            person is identified on this site.
          </p>
        </div>
      </div>
    </footer>
  );
}

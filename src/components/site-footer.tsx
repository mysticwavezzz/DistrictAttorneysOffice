import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Seal } from "./seal";
import { officeDiscordContacts } from "@/config/contacts";

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
              <li><Link href="/privacy-policy">Privacy Policy</Link></li>
              <li><Link href="/terms-of-service">Terms of Service</Link></li>
            </ul>
          </div>

          <div>
            <h4>Contact Us</h4>
            <ul>{officeDiscordContacts.map((contact) => <li key={contact.handle}>{contact.role}: {contact.handle}</li>)}</ul>
          </div>

        </div>

        <div className="fbar">
          <div className="seal seal-sm">
            <Seal />
          </div>
          <p className="foot-text" style={{ margin: 0 }}>
            {siteConfig.name}, {siteConfig.county}. &copy; {year}. All information on this site is related to a ROBLOX game and this site is not affiliated with any real government, county, or agency. No real person is identified on this site.
          </p>
        </div>
      </div>
    </footer>
  );
}

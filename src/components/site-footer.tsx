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
            </ul>
          </div>

          <div>
            <h4>Discord Contacts</h4>
            <ul>{officeDiscordContacts.map((contact) => <li key={contact.handle}>{contact.role}: {contact.handle}</li>)}</ul>
          </div>

          <div>
            <h4>Community Notice</h4>
            <ul>
              <li>{siteConfig.county} is a Roblox roleplay community.</li>
              <li>Contact leadership through Discord.</li>
            </ul>
          </div>
        </div>

        <div className="fbar">
          <div className="seal seal-sm">
            <Seal />
          </div>
          <p className="foot-text" style={{ margin: 0 }}>
            {siteConfig.name}, {siteConfig.county} (a Roblox roleplay
            community). &copy; {year}. All information on this site is in-character (IC) and
            this site is not affiliated with any real government, county, or agency. No real
            person is identified on this site.
          </p>
        </div>
      </div>
    </footer>
  );
}

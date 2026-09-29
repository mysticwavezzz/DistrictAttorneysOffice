import { siteConfig } from "@/config/site";

export function Sidebar() {
  return (
    <aside className="side">
      <div className="sbox">
        <h3>This Section</h3>
        <ul>
          <li>
            <a href="#announcements">Announcements</a>
          </li>
          <li>
            <a href="/report-crime">Report a Crime</a>
          </li>
          <li>
            <a href="/contacts">Contact Us</a>
          </li>
          <li>
            <a href="/records-request">Records Request</a>
          </li>
        </ul>
      </div>

      <div className="sbox">
        <h3>Notice</h3>
        <div className="notice">
          {siteConfig.county} is a Roblox roleplay community. Everything on this site describes
          the in-character (IC) operations of the {siteConfig.county} {siteConfig.name},
          published for players in the style of an official government website. This site is
          not affiliated with any real government, county, or agency, and nothing here
          constitutes real legal advice.
        </div>
      </div>
    </aside>
  );
}

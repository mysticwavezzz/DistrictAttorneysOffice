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

    </aside>
  );
}

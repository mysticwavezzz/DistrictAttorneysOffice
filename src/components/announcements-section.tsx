import { Seal } from "./seal";
import { siteConfig } from "@/config/site";

export interface AnnouncementListItem {
  id: string;
  title: string;
  body: string;
  publishedAt: Date;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function AnnouncementsSection({
  announcements,
}: {
  announcements: AnnouncementListItem[];
}) {
  return (
    <section id="announcements">
      <h2>Public Releases &amp; Announcements</h2>

      {announcements.length === 0 ? (
        <div className="message">
          There are no public announcements at this time. Please check back soon.
        </div>
      ) : (
        announcements.map((announcement, index) => (
          <details key={announcement.id} className="letter" open={index === 0}>
            <summary>
              {formatDate(announcement.publishedAt)} — {announcement.title}
            </summary>
            <div className="letter-body">
              <div className="seal">
                <Seal />
              </div>
              <div className="letter-head">
                {siteConfig.county} {siteConfig.name}
              </div>
              <p>{announcement.body}</p>
              <div className="letter-close">
                <div className="letter-sign">Office of the District Attorney</div>
              </div>
              <div className="letter-disc">
                This release is published for the {siteConfig.county} roleplay community and
                does not describe any real event, agency, or person.
              </div>
            </div>
          </details>
        ))
      )}
    </section>
  );
}

import Link from "next/link";
import { SafeImage } from "@/components/safe-image";

export interface AnnouncementListItem {
  id: string;
  title: string;
  summary: string | null;
  body: string;
  imageUrl: string | null;
  publishedAt: Date;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function previewText(announcement: AnnouncementListItem): string {
  const source = announcement.summary?.trim() || announcement.body;
  if (source.length <= 220) return source;
  return `${source.slice(0, 220).trimEnd()}…`;
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
        <div className="release-list">
          {announcements.map((announcement) => (
            <Link
              key={announcement.id}
              href={`/announcements/${announcement.id}`}
              className="release-card"
            >
              {announcement.imageUrl && (
                <span className="release-card-thumb">
                  <SafeImage src={announcement.imageUrl} alt="" width={320} height={320} />
                </span>
              )}
              <span className="release-card-body">
                <span className="release-card-date">{formatDate(announcement.publishedAt)}</span>
                <span className="release-card-title">{announcement.title}</span>
                <span className="release-card-excerpt">{previewText(announcement)}</span>
                <span className="release-card-more">Read Full Release &rarr;</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

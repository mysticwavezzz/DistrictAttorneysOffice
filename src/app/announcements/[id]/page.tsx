import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { Seal } from "@/components/seal";
import { formatReleaseBody } from "@/lib/format-release-body";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

async function getAnnouncement(id: string) {
  try {
    return await prisma.announcement.findFirst({
      where: { id, audience: "PUBLIC", isPublished: true, publishedAt: { lte: new Date() } },
    });
  } catch (error) {
    console.error("Failed to load announcement", error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const announcement = await getAnnouncement((await params).id);
  if (!announcement) return {};
  return {
    title: announcement.title,
    description: announcement.summary ?? announcement.body.slice(0, 160),
  };
}

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const announcement = await getAnnouncement((await params).id);
  if (!announcement) notFound();

  return (
    <div className="wrap">
      <a href="#main" className="skiplink">
        Skip to main content
      </a>

      <SiteHeader />

      <div className="body">
        <Sidebar />

        <main className="paper" id="main">
          <p className="links-row">
            <Link href="/#announcements">&larr; Back to all announcements</Link>
          </p>

          <p className="eyebrow">{dateFormatter.format(announcement.publishedAt)}</p>
          <h1>{announcement.title}</h1>

          {announcement.imageUrl && (
            <img
              src={announcement.imageUrl}
              alt=""
              className="release-hero"
            />
          )}

          <div className="letter">
            <div className="letter-body">
              <div className="seal">
                <Seal />
              </div>
              <div className="letter-head">
                {siteConfig.county} {siteConfig.name}
              </div>
              <p dangerouslySetInnerHTML={{ __html: formatReleaseBody(announcement.body) }} />
              <div className="letter-close">
                <div className="letter-sign">Office of the District Attorney</div>
              </div>
              <div className="letter-disc">
                This release is published for the {siteConfig.county} roleplay community and
                does not describe any real event, agency, or person.
              </div>
            </div>
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

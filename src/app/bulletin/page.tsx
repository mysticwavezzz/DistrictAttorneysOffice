import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { formatReleaseBody } from "@/lib/format-release-body";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

export default async function BulletinPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.BULLETIN_VIEW)) {
    redirect("/login?callbackUrl=/bulletin");
  }

  let posts: Awaited<ReturnType<typeof prisma.announcement.findMany>> = [];
  try {
    posts = await prisma.announcement.findMany({
      where: { audience: "LAW_ENFORCEMENT", isPublished: true, publishedAt: { lte: new Date() } },
      orderBy: { publishedAt: "desc" },
    });
  } catch (error) {
    console.error("Failed to load bulletin posts", error);
  }

  return (
    <div className="wrap">
      <a href="#main" className="skiplink">
        Skip to main content
      </a>

      <SiteHeader activeHref="/bulletin" />

      <div className="body">
        <Sidebar />

        <main className="paper" id="main">
          <p className="eyebrow">Restricted — Law Enforcement Only</p>
          <h1>Law Enforcement Bulletin</h1>
          <p className="lede">
            Posts here are visible only to signed-in Law Enforcement personnel and District
            Attorney&apos;s Office staff — not the general public.
          </p>

          {posts.length === 0 ? (
            <div className="message">No bulletin posts at this time.</div>
          ) : (
            posts.map((post, index) => (
              <details key={post.id} className="letter" open={index === 0}>
                <summary>
                  {dateFormatter.format(post.publishedAt)} &mdash; {post.title}
                </summary>
                <div className="letter-body">
                  {post.imageUrl && <img src={post.imageUrl} alt="" className="release-hero" />}
                  <p dangerouslySetInnerHTML={{ __html: formatReleaseBody(post.body) }} />
                </div>
              </details>
            ))
          )}
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

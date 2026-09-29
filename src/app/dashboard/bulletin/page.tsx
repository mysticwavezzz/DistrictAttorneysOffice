import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

export default async function BulletinPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.BULLETIN_VIEW)) {
    redirect("/login?error=forbidden");
  }

  let posts: Awaited<ReturnType<typeof prisma.announcement.findMany>> = [];
  try {
    posts = await prisma.announcement.findMany({
      where: { audience: "LAW_ENFORCEMENT", isPublished: true },
      orderBy: { publishedAt: "desc" },
    });
  } catch (error) {
    console.error("Failed to load bulletin posts", error);
  }

  return (
    <div>
      <p className="eyebrow">Internal — Law Enforcement Only</p>
      <h1>Law Enforcement Bulletin</h1>
      <p className="lede">
        Posts here are visible only to Law Enforcement and District Attorney&apos;s Office
        staff — not the public.
      </p>

      {posts.length === 0 ? (
        <div className="message">No bulletin posts at this time.</div>
      ) : (
        posts.map((post, index) => (
          <details key={post.id} className="letter" open={index === 0}>
            <summary>
              {dateFormatter.format(post.publishedAt)} — {post.title}
            </summary>
            <div className="letter-body">
              {post.imageUrl && <img src={post.imageUrl} alt="" className="release-hero" />}
              <p style={{ whiteSpace: "pre-wrap" }}>{post.body}</p>
            </div>
          </details>
        ))
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { createAnnouncement, deleteAnnouncement } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function AnnouncementsAdminPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE)) {
    redirect("/login?error=forbidden");
  }

  let posts: Awaited<ReturnType<typeof prisma.announcement.findMany>> = [];
  try {
    posts = await prisma.announcement.findMany({ orderBy: { publishedAt: "desc" } });
  } catch (error) {
    console.error("Failed to load announcements", error);
  }

  return (
    <div>
      <h1>Public Releases &amp; LE Bulletin</h1>

      <div className="tablewrap">
        <table className="stat">
          <thead>
            <tr>
              <th>Title</th>
              <th>Audience</th>
              <th>Status</th>
              <th>Published</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                  No posts yet.
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr key={post.id}>
                  <td>
                    <Link href={`/dashboard/announcements/${post.id}`}>{post.title}</Link>
                  </td>
                  <td>
                    <span className={`pill ${post.audience === "PUBLIC" ? "pill-navy" : "pill-gold"}`}>
                      {post.audience === "PUBLIC" ? "Public" : "Law Enforcement"}
                    </span>
                  </td>
                  <td>
                    <span className={`pill ${post.isPublished ? "pill-green" : "pill-muted"}`}>
                      {post.isPublished ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td>{dateFormatter.format(post.publishedAt)}</td>
                  <td>
                    <Link href={`/dashboard/announcements/${post.id}`}>Edit</Link>
                  </td>
                  <td>
                    <form action={deleteAnnouncement}>
                      <input type="hidden" name="id" value={post.id} />
                      <button type="submit" className="linklike">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2>New Release</h2>
      <form action={createAnnouncement} className="formbox">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input type="text" id="title" name="title" required maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="summary">
            Summary <span className="hint">(optional — shown on the homepage; full body shows on the release page)</span>
          </label>
          <input type="text" id="summary" name="summary" maxLength={300} />
        </div>
        <div className="field">
          <label htmlFor="body">Full Release Body</label>
          <textarea id="body" name="body" required rows={6} maxLength={8000} />
        </div>
        <div className="field">
          <label htmlFor="imageUrl">
            Image URL <span className="hint">(optional — link to a hosted image)</span>
          </label>
          <input type="text" id="imageUrl" name="imageUrl" maxLength={2000} placeholder="https://" />
        </div>
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="audience">Audience</label>
          <select id="audience" name="audience" defaultValue="PUBLIC">
            <option value="PUBLIC">Public (shown on homepage)</option>
            <option value="LAW_ENFORCEMENT">Law Enforcement Only</option>
          </select>
        </div>
        <button type="submit" className="govbtn">
          Publish
        </button>
      </form>
    </div>
  );
}

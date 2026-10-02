import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { createAnnouncement, deleteAnnouncement } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function statusPill(post: { isPublished: boolean; publishedAt: Date }) {
  if (!post.isPublished) return <span className="pill pill-muted">Draft</span>;
  if (post.publishedAt.getTime() > Date.now()) return <span className="pill pill-gold">Scheduled</span>;
  return <span className="pill pill-green">Published</span>;
}

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
        <table className="stat mobile-cards">
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
                  <td data-label="Title">
                    <Link href={`/dashboard/announcements/${post.id}`}>{post.title}</Link>
                  </td>
                  <td data-label="Audience">
                    <span className={`pill ${post.audience === "PUBLIC" ? "pill-navy" : "pill-gold"}`}>
                      {post.audience === "PUBLIC" ? "Public" : "Law Enforcement"}
                    </span>
                  </td>
                  <td data-label="Status">{statusPill(post)}</td>
                  <td data-label="Published">{dateFormatter.format(post.publishedAt)}</td>
                  <td data-label="Edit">
                    <Link href={`/dashboard/announcements/${post.id}`}>Edit</Link>
                  </td>
                  <td data-label="Action">
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

      <details className="dashboard-fold" open>
      <summary><span className="dashboard-fold-title">New Release</span></summary>
      <form action={createAnnouncement} className="formbox" encType="multipart/form-data">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input type="text" id="title" name="title" required maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="summary">
            Summary <span className="hint">(optional. Shown on the homepage; full body shows on the release page)</span>
          </label>
          <input type="text" id="summary" name="summary" maxLength={300} />
        </div>
        <div className="field">
          <label htmlFor="body">
            Release text <span className="hint">(optional when a PDF is attached; supports **bold**, *italic*, and [link text](https://...))</span>
          </label>
          <textarea id="body" name="body" rows={6} maxLength={8000} />
        </div>
        <div className="field"><label htmlFor="releasePdf">Press release PDF <span className="hint">(optional, max 5 MB; displayed on the public release page)</span></label><input id="releasePdf" name="releasePdf" type="file" accept="application/pdf,.pdf" /></div>
        <div className="field">
          <label htmlFor="imageUrl">
            Image URL <span className="hint">(optional. Link to a hosted image)</span>
          </label>
          <input type="text" id="imageUrl" name="imageUrl" maxLength={2000} placeholder="https://" />
        </div>
        <div className="field-row">
          <div className="field" style={{ maxWidth: 260 }}>
            <label htmlFor="audience">Audience</label>
            <select id="audience" name="audience" defaultValue="PUBLIC">
              <option value="PUBLIC">Public (shown on homepage)</option>
              <option value="LAW_ENFORCEMENT">Law Enforcement Only</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="publishedAt">
            Publish At <span className="hint">(optional. Leave blank to publish immediately)</span>
            </label>
            <input type="datetime-local" id="publishedAt" name="publishedAt" />
          </div>
        </div>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}>
            <input type="checkbox" name="isPublished" defaultChecked />
            Published (uncheck to save as a draft)
          </label>
        </div>
        <button type="submit" className="govbtn">
          Save Release
        </button>
      </form>
      </details>
    </div>
  );
}

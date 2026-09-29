import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { updateAnnouncement, deleteAnnouncement } from "../actions";

export default async function EditAnnouncementPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE)) {
    redirect("/login?error=forbidden");
  }

  let post: Awaited<ReturnType<typeof prisma.announcement.findUnique>> | null = null;
  try {
    post = await prisma.announcement.findUnique({ where: { id: params.id } });
  } catch (error) {
    console.error("Failed to load announcement", error);
  }

  if (!post) notFound();

  return (
    <div>
      <h1>Edit Release</h1>

      <form action={updateAnnouncement} className="formbox">
        <input type="hidden" name="id" value={post.id} />
        <div className="field">
          <label htmlFor="title">Title</label>
          <input type="text" id="title" name="title" required maxLength={200} defaultValue={post.title} />
        </div>
        <div className="field">
          <label htmlFor="summary">
            Summary <span className="hint">(optional — shown on the homepage; full body shows on the release page)</span>
          </label>
          <input type="text" id="summary" name="summary" maxLength={300} defaultValue={post.summary ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="body">Full Release Body</label>
          <textarea id="body" name="body" required rows={6} maxLength={8000} defaultValue={post.body} />
        </div>
        <div className="field">
          <label htmlFor="imageUrl">
            Image URL <span className="hint">(optional — link to a hosted image)</span>
          </label>
          <input
            type="text"
            id="imageUrl"
            name="imageUrl"
            maxLength={2000}
            placeholder="https://"
            defaultValue={post.imageUrl ?? ""}
          />
        </div>
        <div className="field-row">
          <div className="field" style={{ maxWidth: 260 }}>
            <label htmlFor="audience">Audience</label>
            <select id="audience" name="audience" defaultValue={post.audience}>
              <option value="PUBLIC">Public (shown on homepage)</option>
              <option value="LAW_ENFORCEMENT">Law Enforcement Only</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="publishedAt">
              Publish At <span className="hint">(future date schedules it)</span>
            </label>
            <input
              type="datetime-local"
              id="publishedAt"
              name="publishedAt"
              defaultValue={post.publishedAt.toISOString().slice(0, 16)}
            />
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}>
              <input type="checkbox" name="isPublished" defaultChecked={post.isPublished} />
              Published
            </label>
          </div>
        </div>
        <button type="submit" className="govbtn">
          Save Changes
        </button>
      </form>

      <form action={deleteAnnouncement} style={{ marginTop: 16 }}>
        <input type="hidden" name="id" value={post.id} />
        <button type="submit" className="govbtn" style={{ background: "var(--down)", borderColor: "#6b2018" }}>
          Delete
        </button>
      </form>
    </div>
  );
}

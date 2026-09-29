import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { NOTIFICATION_TYPES } from "@/lib/notifications";
import {
  markNotificationRead,
  markAllNotificationsRead,
  updateNotificationPreferences,
} from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    redirect("/login?callbackUrl=/notifications");
  }

  const user = await prisma.user.findUnique({
    where: { discordUserId: session.user.discordUserId },
    select: { id: true, mutedTypes: true },
  });

  const items = user
    ? await prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];
  const mutedSet = new Set((user?.mutedTypes ?? "").split(",").filter(Boolean));

  return (
    <div className="wrap">
      <a href="#main" className="skiplink">
        Skip to main content
      </a>

      <SiteHeader />

      <div className="body">
        <Sidebar />

        <main className="paper" id="main">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <h1>Notifications</h1>
            {items.some((n) => !n.isRead) && (
              <form action={markAllNotificationsRead}>
                <button type="submit" className="linklike">
                  Mark all read
                </button>
              </form>
            )}
          </div>

          {items.length === 0 ? (
            <div className="message">No notifications yet.</div>
          ) : (
            <div className="release-list">
              {items.map((n) => (
                <div key={n.id} className="release-card" style={{ alignItems: "flex-start" }}>
                  <span className="release-card-body">
                    <span className="release-card-date">
                      {dateFormatter.format(n.createdAt)}{" "}
                      {!n.isRead && <span className="pill pill-navy">New</span>}
                    </span>
                    <span className="release-card-title">{n.title}</span>
                    {n.body && <span className="release-card-excerpt">{n.body}</span>}
                    <span style={{ marginTop: 6, display: "flex", gap: 12 }}>
                      {n.link && (
                        <Link href={n.link} className="release-card-more">
                          View &rarr;
                        </Link>
                      )}
                      {!n.isRead && (
                        <form action={markNotificationRead}>
                          <input type="hidden" name="id" value={n.id} />
                          <button type="submit" className="linklike">
                            Mark read
                          </button>
                        </form>
                      )}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <h2>Preferences</h2>
          <form action={updateNotificationPreferences} className="formbox">
            <p className="note-inline">Muted notification types are no longer created for you.</p>
            {NOTIFICATION_TYPES.map((t) => (
              <div className="field" key={t.value}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}>
                  <input type="checkbox" name={`mute_${t.value}`} defaultChecked={mutedSet.has(t.value)} />
                  Mute: {t.label}
                </label>
              </div>
            ))}
            <button type="submit" className="govbtn">
              Save Preferences
            </button>
          </form>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

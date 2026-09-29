import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markNotificationRead, markAllNotificationsRead } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    redirect("/login?callbackUrl=/dashboard/notifications");
  }

  const user = await prisma.user.findUnique({
    where: { discordUserId: session.user.discordUserId },
    select: { id: true },
  });

  const items = user
    ? await prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  return (
    <div>
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
                  {dateFormatter.format(n.createdAt)} {!n.isRead && <span className="pill pill-navy">New</span>}
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
    </div>
  );
}

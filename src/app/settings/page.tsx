import Link from "next/link";
import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser } from "@/lib/case-access";
import { env } from "@/lib/env";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { RoleSyncButton } from "@/components/role-sync-button";
import { NOTIFICATION_TYPES } from "@/lib/notifications";
import { markAllNotificationsRead, markNotificationRead, updateNotificationPreferences } from "@/app/notifications/actions";
import { TIER_DEFINITIONS } from "@/lib/permissions/tiers";
import { BrowserPushSettings } from "@/components/browser-push-settings";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function discordLinkMessage(result: string, linkedId: string | null): string {
  if (result === "success") return linkedId ? `Discord account linked: ${linkedId}.` : "Discord authorization completed, but the link was not saved. Please retry or contact an administrator.";
  if (result === "alreadyLinked") return linkedId ? `Your Roblox profile is already linked to Discord account ${linkedId}.` : "Your Roblox profile already has a Discord account linked.";
  const messages: Record<string, string> = {
    signInRequired: "Sign in with Roblox before linking Discord.",
    stateMismatch: "Discord authorization could not be verified. Start the linking process again.",
    cancelled: "Discord linking was cancelled.",
    notConfigured: "Discord linking is not configured yet. Contact an administrator.",
    oauthFailed: "Discord authorization failed. Please try again.",
    identityFailed: "Discord did not return a valid account identity. Please try again.",
    profileMissing: "Your Roblox profile could not be found. Sign out and sign in again before linking.",
    discordInUse: "That Discord account is already linked to another Roblox profile.",
  };
  return messages[result] ?? "Discord linking could not be completed. Please try again.";
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ discordLink?: string }> }) {
  const session = await auth();
  if (!session?.user?.providerUserId) redirect("/login?callbackUrl=/settings");
  const query = await searchParams;
  const user = await localUser(session.user);
  const notifications = user ? await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }) : [];
  const muted = new Set((user?.mutedTypes ?? "").split(",").filter(Boolean));
  const pushMuted = new Set((user?.pushMutedTypes ?? "").split(",").filter(Boolean));
  const grouped = NOTIFICATION_TYPES.map((type) => ({ ...type, items: notifications.filter((item) => item.type === type.value) })).filter((group) => group.items.length);
  const other = notifications.filter((item) => !NOTIFICATION_TYPES.some((type) => type.value === item.type));

  return <div className="wrap">
    <a href="#main" className="skiplink">Skip to main content</a><SiteHeader />
    <div className="body"><Sidebar />
      <main className="paper" id="main">
        <p className="eyebrow">Your account</p><h1>Settings</h1>
        <section className="formbox" aria-labelledby="profile-heading">
          <h2 id="profile-heading" style={{ marginTop: 0 }}>Profile</h2>
          <p><strong>{session.user.identityProvider === "roblox" ? session.user.username : session.user.displayName}</strong> (@{session.user.username})</p>
          <p className="note-inline">{session.user.identityProvider === "roblox" ? "Roblox ID" : "Discord ID"}: <span className="mono">{session.user.providerUserId}</span></p>
          <p className="note-inline">Current access tiers: {session.user.tiers.filter((tier) => !tier.startsWith("cap:") && !tier.startsWith("denycap:")).map((tier) => TIER_DEFINITIONS[tier as keyof typeof TIER_DEFINITIONS]?.label ?? tier).join(", ") || "No active role tiers"}</p>
          <h3>Discord account</h3>
          {!query.discordLink && (user?.discordUserId ? <p className="message message-success" role="status">Linked to Discord user <span className="mono">{user.discordUserId}</span>. Discord linking does not grant website access.</p> : <>
            <p className="note-inline">Your Discord account can be linked for identity and optional notifications. Roblox remains the only source of sign-in and website permissions.</p>
            <Link className="govbtn-discord" href="/api/discord/link/start">Link Discord</Link>
          </>)}
          {query.discordLink && <p className={query.discordLink === "success" && user?.discordUserId ? "message message-success" : "message message-error"} role={query.discordLink === "success" && user?.discordUserId ? "status" : "alert"}>{discordLinkMessage(query.discordLink, user?.discordUserId ?? null)}</p>}
          <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}><RoleSyncButton /></SessionProvider>
          <p className="note-inline">Role sync checks your current Roblox group roles and refreshes your access. Discord is not used for website permissions.</p>
        </section>
        <section id="notifications" aria-labelledby="notifications-heading">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}><h2 id="notifications-heading">Notifications</h2>{notifications.some((item) => !item.isRead) && <form action={markAllNotificationsRead}><button className="linklike" type="submit">Mark all as read</button></form>}</div>
          {!env.DISCORD_DM_NOTIFICATIONS && <p className="message" role="status">Discord direct messages are disabled. In-site notifications remain available here.</p>}
          <form action={updateNotificationPreferences} className="formbox">
            <h3>Notification preferences</h3><p className="note-inline">Muted types will no longer create notifications for you.</p>
            {NOTIFICATION_TYPES.map((type) => <div className="field" key={type.value}><label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}><input type="checkbox" name={`mute_${type.value}`} defaultChecked={muted.has(type.value)}/> Mute: {type.label}</label></div>)}
            <h4>Computer notifications</h4><p className="note-inline">Choose which notification types may appear outside the website. These settings do not mute in-site notifications.</p>
            {NOTIFICATION_TYPES.map((type) => <div className="field" key={`push-${type.value}`}><label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none" }}><input type="checkbox" name={`push_mute_${type.value}`} defaultChecked={!pushMuted.has(type.value)}/> Allow computer notification: {type.label}</label></div>)}
            <BrowserPushSettings publicKey={env.VAPID_PUBLIC_KEY} />
            <button className="govbtn" type="submit">Save notification preferences</button>
          </form>
          <h3>Recent notifications</h3>
          {!notifications.length ? <div className="message">No notifications yet.</div> : <div className="release-list">{[...grouped.map((group) => ({ label: group.label, items: group.items })), ...(other.length ? [{ label: "Other", items: other }] : [])].map((group) => <section key={group.label}><h4>{group.label}</h4>{group.items.map((item) => <article className="release-card" key={item.id}><div className="release-card-body"><span className="release-card-date">{dateFormatter.format(item.createdAt)} {!item.isRead && <span className="pill pill-navy">New</span>}</span><strong className="release-card-title">{item.title}</strong>{item.body && <span className="release-card-excerpt">{item.body}</span>}<div style={{ display: "flex", gap: 12, marginTop: 6 }}>{item.link && <Link className="release-card-more" href={item.link}>Open &rarr;</Link>}{!item.isRead && <form action={markNotificationRead}><input type="hidden" name="id" value={item.id}/><button type="submit" className="linklike">Mark read</button></form>}</div></div></article>)}</section>)}</div>}
        </section>
      </main>
    </div><SiteFooter />
  </div>;
}

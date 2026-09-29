"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export function ProfileMenu({
  displayName,
  username,
  discordUserId,
  avatarUrl,
  initialTiers,
}: {
  displayName: string;
  username: string;
  discordUserId: string;
  avatarUrl: string | null;
  initialTiers: string[];
}) {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const tiers = session?.user?.tiers?.length ? session.user.tiers : initialTiers;

  async function syncRoles() {
    setSyncing(true);
    setSyncError(false);
    try {
      await update();
      setSyncedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch {
      setSyncError(true);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="profile-menu">
      <button type="button" className="profile-trigger" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((value) => !value)}>
        {avatarUrl ? <Image src={avatarUrl} alt="" width={28} height={28} className="profile-avatar" /> : <span className="profile-avatar profile-avatar-fallback" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>}
        <span>{displayName}</span><span aria-hidden="true">⌄</span>
      </button>
      {open && <div className="profile-panel" aria-label="Your profile">
        <div className="profile-summary">
          <strong>{displayName}</strong>
          <span>@{username}</span>
          <span className="mono">Discord ID: {discordUserId}</span>
          <span>Access: {tiers.length ? tiers.filter((tier) => !tier.startsWith("cap:") && !tier.startsWith("denycap:")).join(", ") || "Custom permissions" : "No active role tiers"}</span>
        </div>
        <Link href="/settings" onClick={() => setOpen(false)}>Settings &amp; notifications</Link>
        <button type="button" onClick={syncRoles} disabled={syncing}>{syncing ? "Syncing Discord roles…" : "Sync Discord roles now"}</button>
        {syncedAt && <span className="profile-sync-note" role="status">Roles synced at {syncedAt}.</span>}
        {syncError && <span className="profile-sync-error" role="alert">Role sync failed. Try again in a moment.</span>}
        <button type="button" onClick={() => signOut({ redirectTo: "/" })}>Sign out</button>
      </div>}
    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { TIER_DEFINITIONS } from "@/lib/permissions/tiers";
import { DEVELOPER_PROFILE_TIER } from "@/lib/permissions/tiers";
import { setDeveloperProfileEnabled } from "@/app/settings/developer-profile-actions";

export function ProfileMenu({
  displayName,
  username,
  identityProvider,
  providerUserId,
  avatarUrl,
  initialTiers,
  canToggleDeveloperProfile,
}: {
  displayName: string;
  username: string;
  identityProvider: "discord" | "roblox";
  providerUserId: string;
  avatarUrl: string | null;
  initialTiers: string[];
  canToggleDeveloperProfile: boolean;
}) {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [developerBusy, setDeveloperBusy] = useState(false);
  const [developerError, setDeveloperError] = useState(false);
  const profileName = identityProvider === "roblox" ? username : displayName;
  const tiers = session?.user ? session.user.tiers : initialTiers;
  const developerEnabled = tiers.includes(DEVELOPER_PROFILE_TIER);
  const tierLabels = tiers.filter((tier) => !tier.startsWith("cap:") && !tier.startsWith("denycap:")).map((tier) => TIER_DEFINITIONS[tier as keyof typeof TIER_DEFINITIONS]?.label ?? tier);

  async function syncRoles() {
    setSyncing(true);
    setSyncError(false);
    try {
      await update({ refreshRoles: true });
      setSyncedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch {
      setSyncError(true);
    } finally {
      setSyncing(false);
    }
  }

  async function toggleDeveloperProfile() {
    setDeveloperBusy(true);
    setDeveloperError(false);
    try {
      await setDeveloperProfileEnabled(!developerEnabled);
      await update({ refreshDeveloperProfile: true });
      router.refresh();
    } catch {
      setDeveloperError(true);
    } finally {
      setDeveloperBusy(false);
    }
  }

  return (
    <div className="profile-menu">
      <button type="button" className="profile-trigger" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((value) => !value)}>
        {avatarUrl ? <Image src={avatarUrl} alt="" width={28} height={28} className="profile-avatar" /> : <span className="profile-avatar profile-avatar-fallback" aria-hidden="true">{profileName.slice(0, 1).toUpperCase()}</span>}
        <span>{profileName}</span><span aria-hidden="true">⌄</span>
      </button>
      {open && <div className="profile-panel" aria-label="Your profile">
        <div className="profile-summary">
          <strong>{profileName}</strong>
          <span>@{username}</span>
          <span className="mono">{identityProvider === "roblox" ? "Roblox ID" : "Discord ID"}: {providerUserId}</span>
          <span>Access: {tierLabels.length ? tierLabels.join(", ") || "Custom permissions" : "No active role tiers"}</span>
        </div>
        <Link href="/settings" onClick={() => setOpen(false)}>Settings &amp; notifications</Link>
        {canToggleDeveloperProfile && <><button type="button" onClick={toggleDeveloperProfile} disabled={developerBusy} aria-pressed={developerEnabled}>{developerBusy ? "Updating developer access…" : developerEnabled ? "Disable Developer Profile" : "Enable Developer Profile"}</button>{developerError && <span className="profile-sync-error" role="alert">Developer access could not be updated. Try again.</span>}</>}
        <button type="button" onClick={syncRoles} disabled={syncing}>{syncing ? "Syncing roles…" : `Sync ${identityProvider === "roblox" ? "Roblox group" : "Discord server"} roles now`}</button>
        {syncedAt && <span className="profile-sync-note" role="status">Roles synced at {syncedAt}.</span>}
        {syncError && <span className="profile-sync-error" role="alert">Role sync failed. Try again in a moment.</span>}
        <button type="button" onClick={() => signOut({ redirectTo: "/" })}>Sign out</button>
      </div>}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const SYNC_INTERVAL_MS = 60_000;

export function RoleSyncPoller() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Refresh Discord roles immediately when the dashboard mounts (including a hard refresh).
    update();
    const interval = setInterval(() => {
      update();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [update]);

  useEffect(() => {
    const key = session?.user
      ? `${session.user.displayName}|${[...session.user.tiers].sort().join(",")}`
      : null;
    if (prevKeyRef.current !== null && key !== null && prevKeyRef.current !== key) {
      router.refresh();
    }
    prevKeyRef.current = key;
  }, [session, router]);

  return null;
}

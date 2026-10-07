"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const SYNC_INTERVAL_MS = 60_000;

export function RoleSyncPoller() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const prevKeyRef = useRef<string | null>(null);
  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(() => {
    // Refresh Roblox group roles immediately when the dashboard mounts.
    void updateRef.current();
    const interval = setInterval(() => {
      void updateRef.current();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

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

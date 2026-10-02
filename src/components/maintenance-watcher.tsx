"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const CHECK_INTERVAL_MS = 60_000;

export function MaintenanceWatcher() {
  const pathname = usePathname();
  const router = useRouter();
  const { update } = useSession();

  useEffect(() => {
    if (pathname === "/98981" || pathname.startsWith("/98981/")) return;
    let stopped = false;
    let failedChecks = 0;
    const check = async () => {
      try {
        const response = await fetch("/api/maintenance/status", { cache: "no-store", credentials: "same-origin" });
        if (response.status === 503) {
          if (!stopped) router.replace("/maintenance");
          return;
        }
        if (!response.ok) throw new Error("Maintenance health check unavailable");
        failedChecks = 0;
        let status = await response.json() as { maintenanceMode?: boolean; maintenanceRequired?: boolean };
        if (status.maintenanceRequired) {
          // Refresh Roblox group roles only while maintenance blocks the session;
          // the auth callback performs the live group-role check on this update.
          await update();
          const refreshed = await fetch("/api/maintenance/status", { cache: "no-store", credentials: "same-origin" });
          if (refreshed.ok) status = await refreshed.json() as typeof status;
        }
        if (stopped) return;
        if (pathname === "/maintenance") {
          if (!status.maintenanceMode) router.replace("/");
          else if (!status.maintenanceRequired) router.refresh();
        } else if (status.maintenanceRequired) router.replace("/maintenance");
      } catch {
        failedChecks += 1;
        if (!stopped && failedChecks >= 2) router.replace("/maintenance");
      }
    };
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, router, update]);

  return null;
}

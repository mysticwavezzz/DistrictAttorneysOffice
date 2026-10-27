export const runtime = "nodejs";

const globalForRosterSync = globalThis as typeof globalThis & { __daoRosterAutoSyncStarted?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runDeadlineCheck } = await import("@/lib/deadline-check");
  const INTERVAL_MS = 6 * 60 * 60 * 1000;

  setTimeout(() => {
    runDeadlineCheck().catch((error) => console.error("Deadline check failed", error));
  }, 30_000);

  setInterval(() => {
    runDeadlineCheck().catch((error) => console.error("Deadline check failed", error));
  }, INTERVAL_MS);

  // Keep the shared roster current in Railway production. Per-user permission
  // refreshes remain faster; this sync updates roster rank/status from the
  // complete Roblox group snapshot and respects each saved manual rank override.
  if (process.env.NODE_ENV === "production"
    && process.env.RAILWAY_ENVIRONMENT_NAME?.toLocaleLowerCase("en-US") === "production"
    && !globalForRosterSync.__daoRosterAutoSyncStarted) {
    globalForRosterSync.__daoRosterAutoSyncStarted = true;
    const { runAutomaticRobloxRosterSync } = await import("@/lib/roblox/automatic-roster-sync");
    const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
    const runSync = () => runAutomaticRobloxRosterSync().catch((error) => console.error("Automatic Roblox roster sync failed", error));
    setTimeout(() => { void runSync(); }, 60_000);
    setInterval(() => { void runSync(); }, SYNC_INTERVAL_MS);
  }
}

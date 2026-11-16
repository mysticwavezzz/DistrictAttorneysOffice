export const runtime = "nodejs";

const globalForRosterSync = globalThis as typeof globalThis & { __daoRosterAutoSyncStarted?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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

    // Automatically sweep due/overdue/inactive case reminders to Discord #reminders every 6 hours.
    const runAutoReminders = async () => {
      try {
        const { prisma } = await import("@/lib/prisma");
        const { sendDiscordCaseReminder } = await import("@/lib/discord/case-reminders");
        const now = new Date();
        const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
        const openCases = await prisma.case.findMany({
          where: { archived: false, isDraft: false, NOT: { stage: { startsWith: "Closed" } } },
          select: { id: true, stage: true, initialFilingDue: true, discDue: true, updatedAt: true },
        });
        for (const c of openCases) {
          if (c.initialFilingDue && c.initialFilingDue < now && c.stage === "Intake") {
            await sendDiscordCaseReminder("FILING_OVERDUE", c.id);
          } else if (c.discDue && c.discDue < now) {
            await sendDiscordCaseReminder("DISCOVERY_OVERDUE", c.id);
          } else if (c.updatedAt < fiveDaysAgo) {
            await sendDiscordCaseReminder("INACTIVITY_ALERT", c.id);
          }
        }
      } catch (error) {
        console.error("Automatic case reminder sweep failed", error);
      }
    };
    setTimeout(() => { void runAutoReminders(); }, 90_000);
    setInterval(() => { void runAutoReminders(); }, SYNC_INTERVAL_MS);
  }
}

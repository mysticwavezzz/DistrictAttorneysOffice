export const runtime = "nodejs";

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
}

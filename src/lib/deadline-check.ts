import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

const WARNING_WINDOW_DAYS = 3;
const RENOTIFY_HOURS = 20;

async function alreadyNotified(caseId: string): Promise<boolean> {
  const since = new Date(Date.now() - RENOTIFY_HOURS * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: { type: "case_deadline", link: `/dashboard/cases/${caseId}`, createdAt: { gte: since } },
  });
  return Boolean(existing);
}

export async function runDeadlineCheck() {
  const soon = new Date();
  soon.setDate(soon.getDate() + WARNING_WINDOW_DAYS);

  let cases: Awaited<ReturnType<typeof prisma.case.findMany>> = [];
  try {
    cases = await prisma.case.findMany({
      where: {
        archived: false,
        assignedAttorneyId: { not: null },
        OR: [{ discDue: { lte: soon } }, { pretrial: { lte: soon } }, { appealBy: { lte: soon } }],
      },
    });
  } catch (error) {
    console.error("Deadline check query failed", error);
    return;
  }

  for (const c of cases) {
    if (!c.assignedAttorneyId) continue;
    if (await alreadyNotified(c.id)) continue;

    const deadlines: string[] = [];
    if (c.discDue) deadlines.push(`Discovery due ${c.discDue.toDateString()}`);
    if (c.pretrial) deadlines.push(`Pretrial ${c.pretrial.toDateString()}`);
    if (c.appealBy) deadlines.push(`Appeal deadline ${c.appealBy.toDateString()}`);

    await notify({
      userId: c.assignedAttorneyId,
      type: "case_deadline",
      title: `Upcoming deadline on ${c.caseNumber}`,
      body: deadlines.join(" — "),
      link: `/dashboard/cases/${c.id}`,
    });
  }
}

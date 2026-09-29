import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getSiteSettings } from "@/lib/site-settings";

const RENOTIFY_HOURS = 20;

async function alreadyNotified(caseId: string): Promise<boolean> {
  const since = new Date(Date.now() - RENOTIFY_HOURS * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: { type: "case_deadline", link: `/dashboard/cases/${caseId}`, createdAt: { gte: since } },
  });
  return Boolean(existing);
}

export async function runDeadlineCheck() {
  const settings = await getSiteSettings();
  const reminderDays = settings.deadlineReminderDays.split(",").map(Number).filter((day) => Number.isInteger(day) && day > 0 && day <= 90);
  const maxDays = Math.max(0, ...reminderDays);
  const soon = new Date();
  soon.setDate(soon.getDate() + maxDays);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let cases: Awaited<ReturnType<typeof prisma.case.findMany>> = [];
  try {
    cases = await prisma.case.findMany({
      where: {
        archived: false,
        assignedAttorneyId: { not: null },
        OR: [
          ...(settings.overdueRemindersEnabled ? [{ discDue: { lte: today } }, { pretrial: { lte: today } }, { appealBy: { lte: today } }] : []),
          ...(maxDays ? [{ discDue: { gt: today, lte: soon } }, { pretrial: { gt: today, lte: soon } }, { appealBy: { gt: today, lte: soon } }] : []),
        ],
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
    const describe = (label: string, date: Date | null) => {
      if (!date) return;
      const days = Math.ceil((new Date(date).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
      if (days <= 0 ? settings.overdueRemindersEnabled : reminderDays.includes(days)) {
        deadlines.push(`${label} ${days < 0 ? `overdue by ${Math.abs(days)} days` : days === 0 ? "due today" : `due in ${days} days`} (${date.toDateString()})`);
      }
    };
    describe("Discovery", c.discDue);
    describe("Pretrial", c.pretrial);
    describe("Appeal deadline", c.appealBy);
    if (deadlines.length === 0) continue;

    await notify({
      userId: c.assignedAttorneyId,
      type: "case_deadline",
      title: `${deadlines.some((d) => d.includes("overdue")) ? "Overdue deadline" : "Upcoming deadline"} on ${c.caseNumber}`,
      body: deadlines.join(" — "),
      link: `/dashboard/cases/${c.id}`,
    });
  }
}

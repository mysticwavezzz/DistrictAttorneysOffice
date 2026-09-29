import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getSiteSettings } from "@/lib/site-settings";

const RENOTIFY_HOURS = 20;
const DEADLINES = [
  { key: "discDue", label: "Discovery due" },
  { key: "pretrial", label: "Pretrial" },
  { key: "appealBy", label: "Appeal deadline" },
] as const;

export async function runDeadlineCheck() {
  const settings = await getSiteSettings();
  const reminderDays = settings.deadlineReminderDays.split(",").map(Number).filter((day) => Number.isInteger(day) && day > 0 && day <= 90);
  const maxDays = Math.max(0, ...reminderDays);
  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const soon = new Date(today);
  soon.setUTCDate(soon.getUTCDate() + maxDays + 1);

  let cases: Awaited<ReturnType<typeof prisma.case.findMany>> = [];
  try {
    cases = await prisma.case.findMany({
      where: {
        archived: false,
        assignedAttorneyId: { not: null },
        OR: [
          ...(settings.overdueRemindersEnabled ? DEADLINES.map(({ key }) => ({ [key]: { lt: today } })) : []),
          ...(maxDays ? DEADLINES.map(({ key }) => ({ [key]: { gte: today, lt: soon } })) : []),
        ],
      },
    });
  } catch (error) {
    console.error("Deadline check query failed", error);
    return;
  }

  for (const item of cases) {
    if (!item.assignedAttorneyId) continue;
    for (const { key, label } of DEADLINES) {
      const dueDate = item[key];
      if (!dueDate) continue;
      const days = Math.ceil((Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate()) - today.getTime()) / 86_400_000);
      if (days < 0 ? !settings.overdueRemindersEnabled : days === 0 ? false : !reminderDays.includes(days)) continue;

      const identity = { userId: item.assignedAttorneyId, caseId: item.id, deadlineType: key, dueDate };
      let reminder;
      try {
        reminder = await prisma.deadlineReminder.upsert({ where: { userId_caseId_deadlineType_dueDate: identity }, create: identity, update: {} });
      } catch (error) {
        console.error("Deadline reminder state could not be loaded", error);
        continue;
      }
      if (reminder.acknowledgedAt || (reminder.snoozedUntil && reminder.snoozedUntil > now)) continue;
      if (reminder.lastNotifiedAt && now.getTime() - reminder.lastNotifiedAt.getTime() < RENOTIFY_HOURS * 3_600_000) continue;

      const dateText = dueDate.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
      await notify({
        userId: item.assignedAttorneyId,
        type: "case_deadline",
        title: `${days < 0 ? "Overdue deadline" : "Upcoming deadline"} on ${item.caseNumber}`,
        body: `${label} ${days < 0 ? `overdue by ${Math.abs(days)} days` : days === 0 ? "due today" : `due in ${days} days`} (${dateText})`,
        link: `/dashboard/cases/${item.id}#deadlines`,
      });
      await prisma.deadlineReminder.update({ where: { id: reminder.id }, data: { lastNotifiedAt: now } });
    }
  }
}

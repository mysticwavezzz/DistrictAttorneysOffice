import { prisma } from "@/lib/prisma";

export async function logActivity(
  actorName: string,
  action: string,
  targetType: string,
  targetLabel: string
) {
  try {
    await prisma.activityLog.create({ data: { actorName, action, targetType, targetLabel } });
  } catch (error) {
    console.error("Failed to record activity log entry", error);
  }
}

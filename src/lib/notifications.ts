import { prisma } from "@/lib/prisma";
import { sendDirectMessage } from "@/lib/discord/dm";
import { env } from "@/lib/env";

export const NOTIFICATION_TYPES: { value: string; label: string }[] = [
  { value: "case_assigned", label: "Case assigned to you" },
  { value: "case_filing", label: "New filing on your case" },
  { value: "case_comment", label: "New comment on your case" },
  { value: "case_deadline", label: "Upcoming case deadline" },
  { value: "case_request", label: "Case change awaiting your review" },
  { value: "case_request_reviewed", label: "Your proposed change was reviewed" },
  { value: "release_published", label: "New release published" },
  { value: "records_request", label: "New public records request" },
  { value: "aopc_submitted", label: "New AOPC awaiting review" },
  { value: "aopc_reviewed", label: "Your AOPC was reviewed" },
];

interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

async function isMuted(userId: string, type: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mutedTypes: true } });
  if (!user) return false;
  return user.mutedTypes.split(",").includes(type);
}

async function pushDiscordDm(userId: string, title: string, body?: string) {
  if (!env.DISCORD_DM_NOTIFICATIONS) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { discordUserId: true } });
    if (!user) return;
    const content = body ? `**${title}**\n${body}` : `**${title}**`;
    await sendDirectMessage(user.discordUserId, content);
  } catch (error) {
    console.error("Failed to send Discord DM notification", error);
  }
}

export async function notify({ userId, type, title, body, link }: NotifyInput) {
  if (await isMuted(userId, type)) return;
  await prisma.notification.create({
    data: { userId, type, title, body, link },
  });
  void pushDiscordDm(userId, title, body);
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, "userId">) {
  const unique = Array.from(new Set(userIds)).filter(Boolean);
  if (unique.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, mutedTypes: true },
  });
  const recipients = users.filter((u) => !u.mutedTypes.split(",").includes(input.type)).map((u) => u.id);
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({ userId, ...input })),
  });
  for (const userId of recipients) {
    void pushDiscordDm(userId, input.title, input.body);
  }
}

export async function userIdsWithCapability(capability: string): Promise<string[]> {
  const { TIER_DEFINITIONS } = await import("@/lib/permissions/tiers");
  const tiersWithCap = new Set<string>(
    Object.values(TIER_DEFINITIONS)
      .filter((t) => (t.capabilities as string[]).includes(capability))
      .map((t) => t.id as string)
  );

  const users = await prisma.user.findMany({ select: { id: true, tiers: true } });
  return users
    .filter((u) => u.tiers.split(",").some((t) => tiersWithCap.has(t)))
    .map((u) => u.id);
}

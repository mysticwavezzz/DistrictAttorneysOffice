import { prisma } from "@/lib/prisma";
import { sendDirectMessage } from "@/lib/discord/dm";
import { env } from "@/lib/env";
import { getSiteSettings } from "@/lib/site-settings";
import { hasCapability } from "@/lib/permissions/resolve";
import type { PermissionTier } from "@/lib/permissions/tiers";

export const NOTIFICATION_TYPES: { value: string; label: string }[] = [
  { value: "case_assigned", label: "Case assigned to you" },
  { value: "case_filing", label: "New filing on your case" },
  { value: "case_comment", label: "New comment on your case" },
  { value: "case_deadline", label: "Upcoming case deadline" },
  { value: "case_request", label: "Case change awaiting your review" },
  { value: "case_request_reviewed", label: "Your proposed change was reviewed" },
  { value: "release_published", label: "New release published" },
  { value: "records_request", label: "New public records request" },
  { value: "aopc_submitted", label: "New affidavit of probable cause awaiting review" },
  { value: "aopc_reviewed", label: "Your affidavit of probable cause was reviewed" },
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
    if (!user?.discordUserId) return;
    const content = body ? `**${title}**\n${body}` : `**${title}**`;
    await sendDirectMessage(user.discordUserId, content);
  } catch (error) {
    console.error("Failed to send Discord DM notification", error);
  }
}

export async function notify({ userId, type, title, body, link }: NotifyInput) {
  if ((await getSiteSettings()).notificationsDisabled) return;
  if (await isMuted(userId, type)) return;
  await prisma.notification.create({
    data: { userId, type, title, body, link },
  });
  void pushDiscordDm(userId, title, body);
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, "userId">) {
  if ((await getSiteSettings()).notificationsDisabled) return;
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
  const users = await prisma.user.findMany({ select: { id: true, tiers: true } });
  return users
    .filter((u) => hasCapability(u.tiers.split(",").filter(Boolean) as PermissionTier[], capability as import("@/lib/permissions/capabilities").Capability))
    .map((u) => u.id);
}

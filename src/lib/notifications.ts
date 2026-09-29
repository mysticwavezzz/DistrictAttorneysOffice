import { prisma } from "@/lib/prisma";

interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

export async function notify({ userId, type, title, body, link }: NotifyInput) {
  await prisma.notification.create({
    data: { userId, type, title, body, link },
  });
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, "userId">) {
  const unique = Array.from(new Set(userIds)).filter(Boolean);
  if (unique.length === 0) return;
  await prisma.notification.createMany({
    data: unique.map((userId) => ({ userId, ...input })),
  });
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

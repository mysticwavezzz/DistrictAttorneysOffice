"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.discordUserId) return null;
  const user = await prisma.user.findUnique({
    where: { discordUserId: session.user.discordUserId },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function markNotificationRead(formData: FormData) {
  const userId = await currentUserId();
  if (!userId) throw new Error("Forbidden");

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing notification id");

  await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });

  revalidatePath("/dashboard/notifications");
}

export async function markAllNotificationsRead() {
  const userId = await currentUserId();
  if (!userId) throw new Error("Forbidden");

  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  revalidatePath("/dashboard/notifications");
}

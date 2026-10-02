"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser } from "@/lib/case-access";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.providerUserId) return null;
  const user = await localUser(session.user);
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

  revalidatePath("/settings");
}

export async function markAllNotificationsRead() {
  const userId = await currentUserId();
  if (!userId) throw new Error("Forbidden");

  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  revalidatePath("/settings");
}

export async function updateNotificationPreferences(formData: FormData) {
  const userId = await currentUserId();
  if (!userId) throw new Error("Forbidden");

  const { NOTIFICATION_TYPES } = await import("@/lib/notifications");
  const muted = NOTIFICATION_TYPES.map((t) => t.value).filter(
    (value) => formData.get(`mute_${value}`) === "on"
  );
  const pushMuted = NOTIFICATION_TYPES.map((t) => t.value).filter(
    (value) => formData.get(`push_mute_${value}`) !== "on"
  );

  await prisma.user.update({
    where: { id: userId },
    data: { mutedTypes: muted.join(","), pushMutedTypes: pushMuted.join(",") },
  });

  revalidatePath("/settings");
}

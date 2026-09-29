"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { announcementInputSchema } from "@/lib/validation/announcement";
import { emptyToNull } from "@/lib/validation/case";
import { notifyMany } from "@/lib/notifications";

function revalidateAll() {
  revalidatePath("/dashboard/announcements");
  revalidatePath("/dashboard/bulletin");
  revalidatePath("/");
}

export async function createAnnouncement(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE)) {
    throw new Error("Forbidden");
  }

  const parsed = announcementInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid announcement");
  }
  const data = parsed.data;

  const creator = await prisma.user.findUnique({
    where: { discordUserId: session.user.discordUserId },
  });

  const created = await prisma.announcement.create({
    data: {
      title: data.title,
      summary: emptyToNull(data.summary),
      body: data.body,
      imageUrl: emptyToNull(data.imageUrl),
      audience: data.audience,
      createdById: creator?.id,
    },
  });

  if (created.isPublished) {
    const { userIdsWithCapability } = await import("@/lib/notifications");
    const capability =
      data.audience === "PUBLIC" ? CAPABILITIES.DASHBOARD_VIEW : CAPABILITIES.BULLETIN_VIEW;
    const recipients = new Set(await userIdsWithCapability(capability));
    if (data.audience === "LAW_ENFORCEMENT") {
      for (const id of await userIdsWithCapability(CAPABILITIES.ANNOUNCEMENTS_MANAGE)) recipients.add(id);
    }
    recipients.delete(creator?.id ?? "");
    await notifyMany(Array.from(recipients), {
      type: "release_published",
      title: `New ${data.audience === "PUBLIC" ? "public release" : "LE bulletin post"}: ${created.title}`,
      link: data.audience === "PUBLIC" ? `/announcements/${created.id}` : "/dashboard/bulletin",
    });
  }

  revalidateAll();
  redirect("/dashboard/announcements");
}

export async function updateAnnouncement(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE)) {
    throw new Error("Forbidden");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing announcement id");

  const parsed = announcementInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid announcement");
  }
  const data = parsed.data;

  await prisma.announcement.update({
    where: { id },
    data: {
      title: data.title,
      summary: emptyToNull(data.summary),
      body: data.body,
      imageUrl: emptyToNull(data.imageUrl),
      audience: data.audience,
      isPublished: formData.get("isPublished") === "on",
    },
  });

  revalidateAll();
  redirect("/dashboard/announcements");
}

export async function deleteAnnouncement(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE)) {
    throw new Error("Forbidden");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing announcement id");

  await prisma.announcement.delete({ where: { id } });

  revalidateAll();
  redirect("/dashboard/announcements");
}

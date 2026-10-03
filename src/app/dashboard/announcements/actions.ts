"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runWithActionDebug } from "@/lib/action-debug";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser } from "@/lib/case-access";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { announcementInputSchema } from "@/lib/validation/announcement";
import { emptyToNull } from "@/lib/validation/case";
import { notifyMany, userIdsWithCapability } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";
import { validateCasePdf } from "@/lib/filing-upload";

async function parseReleasePdf(formData: FormData, current?: { pdfData: string | null; pdfFileName: string | null }) {
  const upload = formData.get("releasePdf");
  if (!(upload instanceof File) || upload.size === 0) {
    return formData.get("removeReleasePdf") === "on" ? { pdfData: null, pdfFileName: null } : current ?? { pdfData: null, pdfFileName: null };
  }
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const error = validateCasePdf(bytes);
  if (error) throw new Error(error);
  return { pdfData: Buffer.from(bytes).toString("base64"), pdfFileName: upload.name.slice(0, 180) || "press-release.pdf" };
}

function revalidateAll() {
  revalidatePath("/dashboard/announcements");
  revalidatePath("/bulletin");
  revalidatePath("/");
}

function resolvePublishedAt(raw: string | undefined): Date {
  const trimmed = emptyToNull(raw);
  if (!trimmed) return new Date();
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid publication date and time.");
  return parsed;
}

async function createAnnouncementImpl(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE)) {
    throw new Error("Forbidden");
  }

  const parsed = announcementInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid announcement");
  }
  const data = parsed.data;
  const pdf = await parseReleasePdf(formData);
  if (!(data.body ?? "").trim() && !pdf.pdfData) throw new Error("Add release text or attach a PDF.");

  const creator = await localUser(session.user);

  const isPublished = formData.get("isPublished") === "on";
  const publishedAt = resolvePublishedAt(data.publishedAt);
  const isScheduledFuture = publishedAt.getTime() > Date.now();

  const created = await prisma.announcement.create({
    data: {
      title: data.title,
      summary: emptyToNull(data.summary),
      body: data.body ?? "",
      imageUrl: emptyToNull(data.imageUrl),
      ...pdf,
      audience: data.audience,
      createdById: creator?.id,
      isPublished,
      publishedAt,
    },
  });

  await logActivity(session.user.displayName, "created", "release", created.title);

  if (created.isPublished && !isScheduledFuture) {
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
      link: data.audience === "PUBLIC" ? `/announcements/${created.id}` : "/bulletin",
    });
  }

  revalidateAll();
  redirect("/dashboard/announcements");
}

async function updateAnnouncementImpl(formData: FormData) {
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

  const existing = await prisma.announcement.findUnique({ where: { id }, select: { pdfData: true, pdfFileName: true } });
  const pdf = await parseReleasePdf(formData, existing ?? undefined);
  if (!(data.body ?? "").trim() && !pdf.pdfData) throw new Error("Add release text or attach a PDF.");

  await prisma.announcement.update({
    where: { id },
    data: {
      title: data.title,
      summary: emptyToNull(data.summary),
      body: data.body ?? "",
      imageUrl: emptyToNull(data.imageUrl),
      ...pdf,
      audience: data.audience,
      isPublished: formData.get("isPublished") === "on",
      publishedAt: resolvePublishedAt(data.publishedAt),
    },
  });

  await logActivity(session.user.displayName, "edited", "release", data.title);
  revalidateAll();
  redirect("/dashboard/announcements");
}

async function deleteAnnouncementImpl(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE)) {
    throw new Error("Forbidden");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing announcement id");

  const post = await prisma.announcement.findUnique({ where: { id } });
  await prisma.announcement.delete({ where: { id } });

  await logActivity(session.user.displayName, "deleted", "release", post?.title ?? id);
  revalidateAll();
  redirect("/dashboard/announcements");
}

export async function createAnnouncement(formData: FormData) { return runWithActionDebug("createAnnouncement", [formData], () => createAnnouncementImpl(formData)); }
export async function updateAnnouncement(formData: FormData) { return runWithActionDebug("updateAnnouncement", [formData], () => updateAnnouncementImpl(formData)); }
export async function deleteAnnouncement(formData: FormData) { return runWithActionDebug("deleteAnnouncement", [formData], () => deleteAnnouncementImpl(formData)); }

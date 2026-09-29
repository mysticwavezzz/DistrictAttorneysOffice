"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { rosterEntrySchema } from "@/lib/validation/roster";
import { emptyToNull, toDate } from "@/lib/validation/case";
import { logActivity } from "@/lib/activity-log";

async function requireManager() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function addRosterEntry(formData: FormData) {
  const session = await requireManager();

  const parsed = rosterEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid roster entry");
  }
  const data = parsed.data;

  await prisma.rosterEntry.create({
    data: {
      name: data.name,
      position: data.position,
      rank: emptyToNull(data.rank),
      unit: emptyToNull(data.unit),
      isUnitLead: formData.get("isUnitLead") === "on",
      discordUserId: emptyToNull(data.discordUserId),
      badgeNumber: emptyToNull(data.badgeNumber),
      startDate: toDate(data.startDate),
      imageUrl: emptyToNull(data.imageUrl),
      about: emptyToNull(data.about),
    },
  });

  await logActivity(session.user.displayName, "added", "roster entry", data.name);
  revalidatePath("/dashboard/roster");
  revalidatePath("/office-info");
}

export async function updateRosterEntry(formData: FormData) {
  const session = await requireManager();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing roster entry id");

  const parsed = rosterEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid roster entry");
  }
  const data = parsed.data;

  await prisma.rosterEntry.update({
    where: { id },
    data: {
      name: data.name,
      position: data.position,
      rank: emptyToNull(data.rank),
      unit: emptyToNull(data.unit),
      isUnitLead: formData.get("isUnitLead") === "on",
      discordUserId: emptyToNull(data.discordUserId),
      badgeNumber: emptyToNull(data.badgeNumber),
      startDate: toDate(data.startDate),
      imageUrl: emptyToNull(data.imageUrl),
      about: emptyToNull(data.about),
    },
  });

  await logActivity(session.user.displayName, "edited", "roster entry", data.name);
  revalidatePath("/dashboard/roster");
  revalidatePath("/office-info");
  redirect("/dashboard/roster");
}

export async function removeRosterEntry(formData: FormData) {
  const session = await requireManager();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing roster entry id");

  const entry = await prisma.rosterEntry.findUnique({ where: { id } });
  await prisma.rosterEntry.delete({ where: { id } });

  await logActivity(session.user.displayName, "removed", "roster entry", entry?.name ?? id);
  revalidatePath("/dashboard/roster");
  revalidatePath("/office-info");
}

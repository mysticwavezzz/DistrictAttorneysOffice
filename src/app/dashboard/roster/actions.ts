"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { rosterEntrySchema } from "@/lib/validation/roster";
import { emptyToNull, toDate } from "@/lib/validation/case";

export async function addRosterEntry(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE)) {
    throw new Error("Forbidden");
  }

  const parsed = rosterEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid roster entry");
  }
  const data = parsed.data;

  await prisma.rosterEntry.create({
    data: {
      name: data.name,
      position: data.position,
      discordUserId: emptyToNull(data.discordUserId),
      badgeNumber: emptyToNull(data.badgeNumber),
      startDate: toDate(data.startDate),
    },
  });

  revalidatePath("/dashboard/roster");
}

export async function removeRosterEntry(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE)) {
    throw new Error("Forbidden");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing roster entry id");

  await prisma.rosterEntry.delete({ where: { id } });

  revalidatePath("/dashboard/roster");
}

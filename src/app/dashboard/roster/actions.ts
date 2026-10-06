"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { runWithActionDebug } from "@/lib/action-debug";
import { localUser, canManageRosterInDivision, canManageUnassignedRosterEntry } from "@/lib/case-access";
import { rosterEntrySchema } from "@/lib/validation/roster";
import { emptyToNull, toDate } from "@/lib/validation/case";
import { logActivity } from "@/lib/activity-log";
import { getSiteConfiguration } from "@/lib/site-settings";
import type { RankOption } from "@/config/ranks";
import type { UnitOption } from "@/config/units";

async function requireManager() {
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE) && !hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE_DIVISION))) {
    throw new Error("Forbidden");
  }
  const user = await localUser(session.user);
  if (!user) throw new Error("Forbidden");
  return { session, user };
}

async function addRosterEntryImpl(formData: FormData) {
  const { session, user } = await requireManager();

  const parsed = rosterEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid roster entry");
  }
  const data = parsed.data;
  if (!canManageRosterInDivision(session.user.tiers, user.division, data.unit)) throw new Error("You can only add roster entries to your assigned division.");
  const [ranks, divisions] = await Promise.all([getSiteConfiguration<RankOption[]>("ranks", []), getSiteConfiguration<UnitOption[]>("divisions", [])]);
  if (!ranks.some((rank) => rank.value === data.rank) || (data.unit && !divisions.some((unit) => unit.value === data.unit))) throw new Error("Select a configured rank and division");

  await prisma.rosterEntry.create({
    data: {
      name: data.name,
      rank: data.rank,
      unit: emptyToNull(data.unit),
      discordUserId: emptyToNull(data.discordUserId),
      robloxUserId: emptyToNull(data.robloxUserId),
      startDate: toDate(data.startDate),
      imageUrl: emptyToNull(data.imageUrl),
      about: emptyToNull(data.about),
    },
  });

  if (data.robloxUserId) await prisma.user.updateMany({ where: { robloxUserId: data.robloxUserId }, data: { division: emptyToNull(data.unit) } });

  await logActivity(session.user.displayName, "added", "roster entry", data.name);
  revalidatePath("/dashboard/roster");
  revalidatePath("/contacts");
}

async function updateRosterEntryImpl(formData: FormData) {
  const { session, user } = await requireManager();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing roster entry id");

  const parsed = rosterEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid roster entry");
  }
  const data = parsed.data;
  const previous = await prisma.rosterEntry.findUnique({ where: { id }, select: { robloxUserId: true, unit: true, robloxSynced: true, name: true, rank: true } });
  const current = previous;
  const mayManageCurrent = Boolean(current && (canManageRosterInDivision(session.user.tiers, user.division, current.unit)
    || canManageUnassignedRosterEntry(session.user.tiers, user.division, current.unit, current.rank)));
  if (!current || !mayManageCurrent || !canManageRosterInDivision(session.user.tiers, user.division, data.unit)) throw new Error("You can only assign unassigned staff to your division or edit entries already in your division.");
  const [ranks, divisions] = await Promise.all([getSiteConfiguration<RankOption[]>("ranks", []), getSiteConfiguration<UnitOption[]>("divisions", [])]);
  if (!ranks.some((rank) => rank.value === data.rank) || (data.unit && !divisions.some((unit) => unit.value === data.unit))) throw new Error("Select a configured rank and division");

  await prisma.rosterEntry.update({
    where: { id },
    data: {
      name: current.robloxSynced ? current.name : data.name,
      rank: current.robloxSynced ? current.rank : data.rank,
      unit: emptyToNull(data.unit),
      discordUserId: emptyToNull(data.discordUserId),
      robloxUserId: current.robloxSynced ? current.robloxUserId : emptyToNull(data.robloxUserId),
      startDate: toDate(data.startDate),
      imageUrl: emptyToNull(data.imageUrl),
      about: emptyToNull(data.about),
    },
  });

  if (previous?.robloxUserId && previous.robloxUserId !== data.robloxUserId) await prisma.user.updateMany({ where: { robloxUserId: previous.robloxUserId }, data: { division: null } });
  if (data.robloxUserId) await prisma.user.updateMany({ where: { robloxUserId: data.robloxUserId }, data: { division: emptyToNull(data.unit) } });

  await logActivity(session.user.displayName, "edited", "roster entry", current.robloxSynced ? current.name : data.name);
  revalidatePath("/dashboard/roster");
  revalidatePath("/contacts");
  redirect("/dashboard/roster");
}

async function removeRosterEntryImpl(formData: FormData) {
  const { session, user } = await requireManager();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing roster entry id");

  const entry = await prisma.rosterEntry.findUnique({ where: { id } });
  if (!entry || !canManageRosterInDivision(session.user.tiers, user.division, entry.unit)) throw new Error("You can only remove roster entries in your assigned division.");
  if (entry.robloxSynced) throw new Error("This entry is managed by Roblox group sync. Remove the member from the Roblox group and run a sync to mark them inactive.");
  await prisma.rosterEntry.delete({ where: { id } });
  if (entry?.robloxUserId) await prisma.user.updateMany({ where: { robloxUserId: entry.robloxUserId }, data: { division: null } });

  await logActivity(session.user.displayName, "removed", "roster entry", entry?.name ?? id);
  revalidatePath("/dashboard/roster");
  revalidatePath("/contacts");
}

async function setRosterActiveImpl(formData: FormData) {
  const { session, user } = await requireManager();
  const id = String(formData.get("id") ?? "");
  const isActive = formData.get("isActive") === "true";
  const current = await prisma.rosterEntry.findUnique({ where: { id }, select: { unit: true, robloxSynced: true } });
  if (!current || !canManageRosterInDivision(session.user.tiers, user.division, current.unit)) throw new Error("You can only manage roster entries in your assigned division.");
  if (current.robloxSynced) throw new Error("Active membership is managed by Roblox group sync. Remove the member from the Roblox group and run a sync to mark them inactive.");
  const entry = await prisma.rosterEntry.update({ where: { id }, data: { isActive } });
  await logActivity(session.user.displayName, isActive ? "reactivated" : "deactivated", "roster entry", entry.name);
  revalidatePath("/dashboard/roster");
  revalidatePath("/contacts");
}

export async function addRosterEntry(formData: FormData) { return runWithActionDebug("addRosterEntry", [formData], () => addRosterEntryImpl(formData)); }
export async function updateRosterEntry(formData: FormData) { return runWithActionDebug("updateRosterEntry", [formData], () => updateRosterEntryImpl(formData)); }
export async function removeRosterEntry(formData: FormData) { return runWithActionDebug("removeRosterEntry", [formData], () => removeRosterEntryImpl(formData)); }
export async function setRosterActive(formData: FormData) { return runWithActionDebug("setRosterActive", [formData], () => setRosterActiveImpl(formData)); }

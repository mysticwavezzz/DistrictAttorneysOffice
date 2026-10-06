"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { runWithActionDebug } from "@/lib/action-debug";
import { localUser, canManageRosterInDivision, canManageUnassignedRosterEntry, canManageCriminalGroupRosterEntry } from "@/lib/case-access";
import { rosterEntrySchema } from "@/lib/validation/roster";
import { emptyToNull, toDate } from "@/lib/validation/case";
import { logActivity } from "@/lib/activity-log";
import { getSiteConfiguration } from "@/lib/site-settings";
import type { RankOption } from "@/config/ranks";
import type { UnitOption } from "@/config/units";

async function requireManager() {
  const session = await auth();
  const canManageRoster = session?.user && (hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE)
    || hasCapability(session.user.tiers, CAPABILITIES.ROSTER_MANAGE_DIVISION)
    || (session.user.tiers.includes("senior_assistant_district_attorney") && hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION)));
  if (!session?.user?.providerUserId || !canManageRoster) {
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
  if (!data.rank) throw new Error("Select a configured rank.");
  if (!canManageRosterInDivision(session.user.tiers, user.division, data.unit)) throw new Error("You can only add roster entries to your assigned division.");
  if (data.divisionGroup && data.unit !== "Criminal Division") throw new Error("Groups 1 and 2 are only available in the Criminal Division.");
  const [ranks, divisions] = await Promise.all([getSiteConfiguration<RankOption[]>("ranks", []), getSiteConfiguration<UnitOption[]>("divisions", [])]);
  if (!ranks.some((rank) => rank.value === data.rank) || (data.unit && !divisions.some((unit) => unit.value === data.unit))) throw new Error("Select a configured rank and division");

  await prisma.rosterEntry.create({
    data: {
      name: data.name,
      rank: data.rank,
      unit: emptyToNull(data.unit),
      divisionGroup: data.unit === "Criminal Division" ? emptyToNull(data.divisionGroup) : null,
      discordUserId: emptyToNull(data.discordUserId),
      robloxUserId: emptyToNull(data.robloxUserId),
      startDate: toDate(data.startDate),
      imageUrl: emptyToNull(data.imageUrl),
      about: emptyToNull(data.about),
    },
  });

  if (data.robloxUserId) await prisma.user.updateMany({ where: { robloxUserId: data.robloxUserId }, data: { division: emptyToNull(data.unit), divisionGroup: data.unit === "Criminal Division" ? emptyToNull(data.divisionGroup) : null } });

  await logActivity(session.user.displayName, "added", "roster entry", data.name);
  revalidatePath("/dashboard/roster");
  revalidatePath("/contacts");
}

async function updateRosterEntryImpl(formData: FormData) {
  const { session, user } = await requireManager();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing roster entry id");

  const previous = await prisma.rosterEntry.findUnique({ where: { id }, select: { robloxUserId: true, unit: true, divisionGroup: true, robloxSynced: true, name: true, rank: true } });
  if (!previous) throw new Error("Roster entry not found. Refresh the roster and try again.");
  const raw = Object.fromEntries(formData);
  // Synced entries may legitimately have no configured rank. Preserve the
  // saved Roblox value instead of rejecting an otherwise valid unit/group edit.
  const parsed = rosterEntrySchema.safeParse({ ...raw, name: raw.name || previous.name, rank: raw.rank || previous.rank || (previous.robloxSynced ? "Unranked" : "") });
  if (!parsed.success) {
    throw new Error("Invalid roster entry");
  }
  const data = parsed.data;
  const current = previous;
  const mayManageCurrent = Boolean(current && (canManageRosterInDivision(session.user.tiers, user.division, current.unit)
    || canManageUnassignedRosterEntry(session.user.tiers, user.division, current.unit, current.rank)));
  if (!current || !mayManageCurrent || !canManageRosterInDivision(session.user.tiers, user.division, data.unit)) throw new Error("You can only assign unassigned staff to your division or edit entries already in your division.");
  if (data.divisionGroup && data.unit !== "Criminal Division") throw new Error("Groups 1 and 2 are only available in the Criminal Division.");
  const [ranks, divisions] = await Promise.all([getSiteConfiguration<RankOption[]>("ranks", []), getSiteConfiguration<UnitOption[]>("divisions", [])]);
  if ((!current.robloxSynced && !ranks.some((rank) => rank.value === data.rank)) || (current.robloxSynced && current.rank && !ranks.some((rank) => rank.value === current.rank)) || (data.unit && !divisions.some((unit) => unit.value === data.unit))) throw new Error("Select a configured rank and division");

  await prisma.rosterEntry.update({
    where: { id },
    data: {
      name: current.robloxSynced ? current.name : data.name,
      rank: current.robloxSynced ? current.rank : data.rank,
      unit: emptyToNull(data.unit),
      divisionGroup: data.unit === "Criminal Division" ? emptyToNull(data.divisionGroup) : null,
      discordUserId: emptyToNull(data.discordUserId),
      robloxUserId: current.robloxSynced ? current.robloxUserId : emptyToNull(data.robloxUserId),
      startDate: toDate(data.startDate),
      imageUrl: emptyToNull(data.imageUrl),
      about: emptyToNull(data.about),
    },
  });

  if (previous.robloxUserId && previous.robloxUserId !== data.robloxUserId) await prisma.user.updateMany({ where: { robloxUserId: previous.robloxUserId }, data: { division: null, divisionGroup: null } });
  if (data.robloxUserId) {
    const assignedGroup = data.unit === "Criminal Division" ? emptyToNull(data.divisionGroup) : null;
    await prisma.user.updateMany({ where: { robloxUserId: data.robloxUserId }, data: { division: emptyToNull(data.unit), divisionGroup: assignedGroup } });
    const linkedUser = await prisma.user.findUnique({ where: { robloxUserId: data.robloxUserId }, select: { id: true } });
    if (linkedUser && previous.divisionGroup !== assignedGroup) {
      await prisma.case.updateMany({ where: { division: "Criminal Division", assignedAttorneyId: linkedUser.id }, data: { divisionGroup: assignedGroup } });
      await prisma.case.updateMany({ where: { division: "Criminal Division", assignedAttorneyId: null, createdById: linkedUser.id }, data: { divisionGroup: assignedGroup } });
    }
  }

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
  if (entry?.robloxUserId) await prisma.user.updateMany({ where: { robloxUserId: entry.robloxUserId }, data: { division: null, divisionGroup: null } });

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

async function updateCriminalGroupAssignmentImpl(formData: FormData) {
  const { session, user } = await requireManager();
  const id = String(formData.get("id") ?? "");
  const groupValue = String(formData.get("divisionGroup") ?? "");
  const divisionGroup = groupValue === "" ? null : groupValue;
  if (!id || (divisionGroup !== null && divisionGroup !== "1" && divisionGroup !== "2")) throw new Error("Choose a valid Criminal Division group.");

  const entry = await prisma.rosterEntry.findUnique({ where: { id }, select: { id: true, name: true, unit: true, divisionGroup: true, robloxUserId: true } });
  if (!entry || entry.unit !== "Criminal Division" || !canManageCriminalGroupRosterEntry(session.user.tiers, user.division, user.divisionGroup, entry.unit, entry.divisionGroup)
    || (divisionGroup !== null && !canManageCriminalGroupRosterEntry(session.user.tiers, user.division, user.divisionGroup, entry.unit, divisionGroup))) {
    throw new Error("You can only place ungrouped Criminal Division staff into your assigned SADA group.");
  }

  const linkedUser = entry.robloxUserId ? await prisma.user.findUnique({ where: { robloxUserId: entry.robloxUserId }, select: { id: true } }) : null;
  await prisma.$transaction(async (tx) => {
    await tx.rosterEntry.update({ where: { id }, data: { divisionGroup } });
    if (entry.robloxUserId) await tx.user.updateMany({ where: { robloxUserId: entry.robloxUserId }, data: { division: "Criminal Division", divisionGroup } });
    if (linkedUser && entry.divisionGroup !== divisionGroup) {
      await tx.case.updateMany({ where: { division: "Criminal Division", assignedAttorneyId: linkedUser.id }, data: { divisionGroup } });
      await tx.case.updateMany({ where: { division: "Criminal Division", assignedAttorneyId: null, createdById: linkedUser.id }, data: { divisionGroup } });
    }
  });

  await logActivity(session.user.displayName, divisionGroup ? "assigned to group" : "removed from group", "roster entry", entry.name);
  revalidatePath("/dashboard/roster");
  revalidatePath("/dashboard/cases");
}

export async function addRosterEntry(formData: FormData) { return runWithActionDebug("addRosterEntry", [formData], () => addRosterEntryImpl(formData)); }
export async function updateRosterEntry(formData: FormData) { return runWithActionDebug("updateRosterEntry", [formData], () => updateRosterEntryImpl(formData)); }
export async function removeRosterEntry(formData: FormData) { return runWithActionDebug("removeRosterEntry", [formData], () => removeRosterEntryImpl(formData)); }
export async function setRosterActive(formData: FormData) { return runWithActionDebug("setRosterActive", [formData], () => setRosterActiveImpl(formData)); }
export async function updateCriminalGroupAssignment(formData: FormData) { return runWithActionDebug("updateCriminalGroupAssignment", [formData], () => updateCriminalGroupAssignmentImpl(formData)); }

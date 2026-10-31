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
import { RANKS, type RankOption } from "@/config/ranks";
import { UNITS, type UnitOption } from "@/config/units";
import { canAssignStaffRank, canControlStaff, replaceGroupRankTier } from "@/lib/staff-rank-control";
import { parseStoredTiers } from "@/lib/contact-mail";
import { isAssignableAttorneyRank } from "@/lib/case-assignees";

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
  const [ranks, divisions] = await Promise.all([getSiteConfiguration<RankOption[]>("ranks", RANKS), getSiteConfiguration<UnitOption[]>("divisions", UNITS)]);
  if (!ranks.some((rank) => rank.value === data.rank) || (data.unit && !divisions.some((unit) => unit.value === data.unit))) throw new Error("Select a configured rank and division");
  if (data.robloxUserId && await prisma.revokedStaffAccess.findUnique({ where: { robloxUserId: data.robloxUserId } })) throw new Error("This Roblox account has been removed from site access.");

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
      orientationPending: data.unit === "Criminal Division" && isAssignableAttorneyRank(data.rank),
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

  const previous = await prisma.rosterEntry.findUnique({ where: { id }, select: { robloxUserId: true, unit: true, divisionGroup: true, robloxSynced: true, name: true, rank: true, isProsecutorInTraining: true, isActive: true, orientationAcknowledgedAt: true, onboardingRoute: true } });
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
  const requestedOnboardingRoute = String(raw.onboardingRoute ?? "UNASSIGNED");
  const isProsecutorInTraining = raw.isProsecutorInTraining === "on" || requestedOnboardingRoute === "TRAINING";
  const onboardingRoute = isProsecutorInTraining ? "TRAINING" : requestedOnboardingRoute === "EXPERIENCED" ? "EXPERIENCED" : null;
  const exemptionReason = String(raw.trainingExemptionReason ?? "").trim();
  const mayManageCurrent = Boolean(current && (canManageRosterInDivision(session.user.tiers, user.division, current.unit)
    || canManageUnassignedRosterEntry(session.user.tiers, user.division, current.unit, current.rank)));
  if (!current || !mayManageCurrent || !canManageRosterInDivision(session.user.tiers, user.division, data.unit)) throw new Error("You can only assign unassigned staff to your division or edit entries already in your division.");
  if (data.divisionGroup && data.unit !== "Criminal Division") throw new Error("Groups 1 and 2 are only available in the Criminal Division.");
  if (requestedOnboardingRoute !== "UNASSIGNED" && requestedOnboardingRoute !== "EXPERIENCED" && requestedOnboardingRoute !== "TRAINING") throw new Error("Select a valid attorney onboarding route.");
  if (requestedOnboardingRoute === "EXPERIENCED" && (!current.isActive || !current.robloxUserId || data.unit !== "Criminal Division" || !isAssignableAttorneyRank(current.rank) || !data.divisionGroup || exemptionReason.length < 20)) {
    throw new Error("For the experienced route, record an active linked Criminal Division attorney, assign Group 1 or 2, and give at least 20 characters explaining the supervisor's experience review.");
  }
  if (isProsecutorInTraining && (!current.robloxUserId || current.robloxUserId !== data.robloxUserId || !current.isActive || data.unit !== "Criminal Division" || !isAssignableAttorneyRank(current.rank))) {
    throw new Error("A trainee must be an active, linked Criminal Division attorney before course access can be enabled.");
  }
  if ((isProsecutorInTraining !== current.isProsecutorInTraining || onboardingRoute !== current.onboardingRoute)
    && !canControlStaff(session.user.tiers, session.user.providerUserId, user.division, current)) {
    throw new Error("Only authorized leadership may change the attorney onboarding route or Prosecutor-in-Training access.");
  }
  const [ranks, divisions] = await Promise.all([getSiteConfiguration<RankOption[]>("ranks", RANKS), getSiteConfiguration<UnitOption[]>("divisions", UNITS)]);
  if (data.unit && !divisions.some((unit) => unit.value === data.unit)) throw new Error("Select a configured division");
  if (!current.robloxSynced && data.robloxUserId && await prisma.revokedStaffAccess.findUnique({ where: { robloxUserId: data.robloxUserId } })) throw new Error("This Roblox account has been removed from site access.");

  await prisma.rosterEntry.update({
    where: { id },
    data: {
      name: current.robloxSynced ? current.name : data.name,
      rank: current.rank,
      unit: emptyToNull(data.unit),
      divisionGroup: data.unit === "Criminal Division" ? emptyToNull(data.divisionGroup) : null,
      discordUserId: emptyToNull(data.discordUserId),
      robloxUserId: current.robloxSynced ? current.robloxUserId : emptyToNull(data.robloxUserId),
      startDate: toDate(data.startDate),
      imageUrl: emptyToNull(data.imageUrl),
      about: emptyToNull(data.about),
      isProsecutorInTraining,
      onboardingRoute,
      trainingSupervisor: onboardingRoute === "EXPERIENCED" ? session.user.displayName : isProsecutorInTraining ? session.user.displayName : null,
      trainingExemptionReason: onboardingRoute === "EXPERIENCED" ? exemptionReason : null,
      orientationPending: isProsecutorInTraining ? false : data.unit === "Criminal Division" && isAssignableAttorneyRank(current.rank) && !current.orientationAcknowledgedAt,
      ...(onboardingRoute === "EXPERIENCED" || isProsecutorInTraining ? { trainingPlacementStatus: null } : {}),
      ...(isProsecutorInTraining ? { trainingGraduatedAt: null } : {}),
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
  if (isProsecutorInTraining !== current.isProsecutorInTraining) await logActivity(session.user.displayName, isProsecutorInTraining ? "enrolled" : "removed from training", "criminal division course", current.name);
  revalidatePath("/dashboard/roster");
  revalidatePath("/contacts");
  redirect("/dashboard/roster");
}

async function removeRosterEntryImpl(formData: FormData) {
  const { session, user } = await requireManager();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing roster entry id");

  const entry = await prisma.rosterEntry.findUnique({ where: { id } });
  if (!entry || !canControlStaff(session.user.tiers, session.user.providerUserId, user.division, entry)) throw new Error("Only CADA or higher can remove staff within their authority.");
  await prisma.$transaction(async (tx) => {
    if (entry.robloxUserId) {
      await tx.revokedStaffAccess.upsert({
        where: { robloxUserId: entry.robloxUserId },
        create: { robloxUserId: entry.robloxUserId, username: entry.name, revokedBy: session.user.displayName },
        update: { username: entry.name, revokedBy: session.user.displayName, revokedAt: new Date() },
      });
      await tx.user.updateMany({ where: { robloxUserId: entry.robloxUserId }, data: { division: null, divisionGroup: null, tiers: "" } });
    }
    await tx.rosterEntry.delete({ where: { id } });
  });

  await logActivity(session.user.displayName, "removed", "roster entry", entry?.name ?? id);
  revalidatePath("/dashboard/roster");
  revalidatePath("/contacts");
  revalidatePath("/dashboard");
  redirect("/dashboard/roster");
}

async function setRosterActiveImpl(formData: FormData) {
  const { session, user } = await requireManager();
  const id = String(formData.get("id") ?? "");
  const isActive = formData.get("isActive") === "true";
  const current = await prisma.rosterEntry.findUnique({ where: { id }, select: { unit: true, robloxSynced: true } });
  if (!current || !canManageRosterInDivision(session.user.tiers, user.division, current.unit)) throw new Error("You can only manage roster entries in your assigned division.");
  if (current.robloxSynced) throw new Error("Active membership is managed by Roblox group sync. Remove the member from the Roblox group and run a sync to mark them inactive.");
  const entry = await prisma.rosterEntry.update({ where: { id }, data: { isActive, ...(!isActive ? { isProsecutorInTraining: false } : {}) } });
  await logActivity(session.user.displayName, isActive ? "reactivated" : "deactivated", "roster entry", entry.name);
  revalidatePath("/dashboard/roster");
  revalidatePath("/contacts");
}

async function setRosterRankOverrideImpl(formData: FormData) {
  const { session, user } = await requireManager();
  const id = String(formData.get("id") ?? "");
  const requestedRank = String(formData.get("rankOverride") ?? "").trim();
  const entry = await prisma.rosterEntry.findUnique({ where: { id } });
  if (!entry || !canControlStaff(session.user.tiers, session.user.providerUserId, user.division, entry)) throw new Error("Only CADA or higher can change this staff member's rank.");
  if (!requestedRank && !entry.robloxSynced) throw new Error("Manual roster entries require a rank.");
  if (requestedRank) {
    const configuredRanks = await getSiteConfiguration<RankOption[]>("ranks", RANKS);
    if (!configuredRanks.some((rank) => rank.value === requestedRank) || !canAssignStaffRank(session.user.tiers, requestedRank)) throw new Error("You cannot assign that rank.");
  }
  const nextRank = requestedRank || entry.robloxRoleName || entry.rank;
  await prisma.$transaction(async (tx) => {
    await tx.rosterEntry.update({ where: { id }, data: { rank: nextRank, rankOverride: requestedRank || null, trainingAutoRankOverride: false, robloxRoleName: entry.robloxSynced ? entry.robloxRoleName ?? entry.rank : null } });
    if (entry.robloxUserId) {
      const linked = await tx.user.findUnique({ where: { robloxUserId: entry.robloxUserId }, select: { tiers: true } });
      if (linked) await tx.user.update({ where: { robloxUserId: entry.robloxUserId }, data: { tiers: replaceGroupRankTier(parseStoredTiers(linked.tiers), nextRank).join(",") } });
    }
  });
  await logActivity(session.user.displayName, requestedRank ? "overrode rank" : "restored Roblox rank", "roster entry", `${entry.name}: ${entry.rank ?? "none"} → ${nextRank ?? "none"}`);
  revalidatePath("/dashboard/roster");
  revalidatePath(`/dashboard/roster/${id}`);
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
export async function setRosterRankOverride(formData: FormData) { return runWithActionDebug("setRosterRankOverride", [formData], () => setRosterRankOverrideImpl(formData)); }
export async function setRosterActive(formData: FormData) { return runWithActionDebug("setRosterActive", [formData], () => setRosterActiveImpl(formData)); }
export async function updateCriminalGroupAssignment(formData: FormData) { return runWithActionDebug("updateCriminalGroupAssignment", [formData], () => updateCriminalGroupAssignmentImpl(formData)); }

async function placeTrainingGraduateImpl(formData: FormData) {
  const { session, user } = await requireManager();
  const id = String(formData.get("id") ?? "");
  const divisionGroup = String(formData.get("divisionGroup") ?? "");
  if (!id || !["1", "2"].includes(divisionGroup)) throw new Error("Choose a valid Criminal Division group.");
  const entry = await prisma.rosterEntry.findUnique({ where: { id } });
  if (!entry || !entry.isActive || entry.unit !== "Criminal Division" || entry.trainingPlacementStatus !== "PLACEMENT_PENDING" || !entry.isProsecutorInTraining) throw new Error("This trainee is no longer awaiting placement.");
  if (!canManageRosterInDivision(session.user.tiers, user.division, entry.unit) && !(user.division === "Criminal Division" && user.divisionGroup === divisionGroup && hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION))) throw new Error("You cannot place trainees in this group.");
  const supervisors = await prisma.rosterEntry.count({ where: { isActive: true, unit: "Criminal Division", divisionGroup, rank: { in: ["Senior Assistant District Attorney", "Supervisory Assistant District Attorney", "Chief Assistant District Attorney", "Deputy District Attorney", "District Attorney"] } } });
  if (!supervisors) throw new Error("That group has no active supervising attorney. Choose a staffed group.");
  const linkedUser = entry.robloxUserId ? await prisma.user.findUnique({ where: { robloxUserId: entry.robloxUserId }, select: { id: true } }) : null;
  if (!linkedUser) throw new Error("The trainee must sign in once before placement can be completed.");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const attempt = await tx.trainingAttempt.findUnique({ where: { activeForUserId: linkedUser.id } });
    if (!attempt || attempt.status !== "PLACEMENT_PENDING") throw new Error("The passed mock-trial record is missing; placement was not changed.");
    await tx.trainingAttempt.update({ where: { id: attempt.id }, data: { status: "COMPLETED", activeForUserId: null, placedGroup: divisionGroup, completedAt: now } });
    const rankNeedsReview = Boolean(entry.rankOverride && entry.rankOverride !== "Assistant District Attorney") || (!entry.robloxSynced && entry.rank !== "Assistant District Attorney");
    const addTrainingOverride = entry.robloxSynced && !entry.rankOverride && entry.rank !== "Assistant District Attorney";
    await tx.rosterEntry.update({ where: { id: entry.id }, data: { isProsecutorInTraining: false, divisionGroup, trainingPlacementStatus: rankNeedsReview ? "PLACED_RANK_REVIEW" : "PLACED", trainingGraduatedAt: now, orientationPending: true, ...(addTrainingOverride ? { rankOverride: "Assistant District Attorney", trainingAutoRankOverride: true } : {}) } });
    await tx.user.update({ where: { id: linkedUser.id }, data: { division: "Criminal Division", divisionGroup } });
    await tx.activityLog.create({ data: { actorName: session.user.displayName, action: "placed passed trainee in Criminal Division group; orientation required", targetType: "roster entry", targetLabel: `${entry.name} · Group ${divisionGroup}` } });
  });
  revalidatePath("/dashboard/roster");
}

export async function placeTrainingGraduate(formData: FormData) { return runWithActionDebug("placeTrainingGraduate", [formData], () => placeTrainingGraduateImpl(formData)); }

async function reviewTrainingAttemptImpl(formData: FormData) {
  const { session, user } = await requireManager();
  const attemptId = String(formData.get("attemptId") ?? "");
  const note = String(formData.get("reviewNote") ?? "").trim();
  if (!attemptId || note.length < 5) throw new Error("Add a short note documenting the supervisor review.");
  const attempt = await prisma.trainingAttempt.findUnique({ where: { id: attemptId }, include: { user: { select: { robloxUserId: true } } } });
  if (!attempt || !attempt.needsSupervisorReview || attempt.status !== "MOCK" || !attempt.user.robloxUserId) throw new Error("This course attempt is not awaiting supervisor review.");
  const roster = await prisma.rosterEntry.findUnique({ where: { robloxUserId: attempt.user.robloxUserId } });
  if (!roster || roster.unit !== "Criminal Division" || !canManageRosterInDivision(session.user.tiers, user.division, roster.unit)) throw new Error("You cannot review this Criminal Division attempt.");
  await prisma.$transaction([
    prisma.trainingAttempt.update({ where: { id: attempt.id }, data: { needsSupervisorReview: false, supervisorReviewedAt: new Date(), supervisorReviewedBy: session.user.displayName, supervisorReviewNote: note } }),
    prisma.activityLog.create({ data: { actorName: session.user.displayName, action: "reviewed attorney training mock-trial attempts", targetType: "roster entry", targetLabel: roster.name } }),
  ]);
  revalidatePath("/dashboard/roster");
}

export async function reviewTrainingAttempt(formData: FormData) { return runWithActionDebug("reviewTrainingAttempt", [formData], () => reviewTrainingAttemptImpl(formData)); }

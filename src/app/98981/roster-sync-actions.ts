"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runWithActionDebug } from "@/lib/action-debug";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { fetchRobloxGroupMembers } from "@/lib/roblox/groups";
import { ROBLOX_DA_GROUP_ID } from "@/config/roblox-role-mappings";
import { buildRobloxRosterSyncPreview, type Candidate, type SyncPreview } from "@/lib/roblox/automatic-roster-sync";

const PREVIEW_MINUTES = 15;
const syncPath = "/98981/roster-sync";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) throw new Error("Forbidden");
  return session;
}

async function previewRobloxRosterSyncImpl() {
  const session = await requireAdmin();
  let run;
  try {
    // A complete paginated snapshot is required before any removal can be proposed.
    const members = await fetchRobloxGroupMembers(ROBLOX_DA_GROUP_ID);
    const preview = await buildRobloxRosterSyncPreview(members);
    run = await prisma.robloxRosterSyncRun.create({
      data: {
        actorName: session.user.displayName,
        groupId: String(ROBLOX_DA_GROUP_ID),
        status: "PREVIEW",
        previewData: JSON.stringify(preview),
        additions: preview.additions.length,
        updates: preview.updates.length,
        inactivations: preview.inactivations.length,
        exceptions: preview.exceptions.length,
        expiresAt: new Date(Date.now() + PREVIEW_MINUTES * 60_000),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Roblox roster preview failed.";
    run = await prisma.robloxRosterSyncRun.create({ data: { actorName: session.user.displayName, groupId: String(ROBLOX_DA_GROUP_ID), status: "FAILED", previewData: JSON.stringify({ error: message }), exceptions: 1, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
  }
  revalidatePath(syncPath);
  redirect(`${syncPath}?sync=${encodeURIComponent(run.id)}`);
}

async function applyRobloxRosterSyncImpl(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("syncId") ?? "");
  if (!id) throw new Error("Missing sync preview.");
  const now = new Date();
  try {
    const approvedRun = await prisma.robloxRosterSyncRun.findUnique({ where: { id } });
    if (!approvedRun || approvedRun.actorName !== session.user.displayName || approvedRun.groupId !== String(ROBLOX_DA_GROUP_ID) || approvedRun.status !== "PREVIEW" || approvedRun.expiresAt <= now) throw new Error("This preview expired or was already applied. Create a fresh preview.");
    const liveMembers = await fetchRobloxGroupMembers(ROBLOX_DA_GROUP_ID);
    const livePreview = await buildRobloxRosterSyncPreview(liveMembers);
    const signature = (data: SyncPreview) => JSON.stringify({
      additions: data.additions.map((item) => [item.userId, item.roleId, item.roleName]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      updates: data.updates.map((item) => [item.entryId, item.userId, item.roleId, item.roleName]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      inactivations: data.inactivations.map((item) => [item.entryId, item.newRoleId, item.newRank]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      exceptions: data.exceptions.map((item) => [item.userId ?? "", item.username ?? "", item.reason]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    });
    if (signature(livePreview) !== signature(JSON.parse(approvedRun.previewData) as SyncPreview)) throw new Error("Group membership or roster records changed after this preview. Nothing was applied; generate a fresh preview.");
    await prisma.$transaction(async (tx) => {
      const run = await tx.robloxRosterSyncRun.findUnique({ where: { id } });
      if (!run || run.actorName !== session.user.displayName || run.groupId !== String(ROBLOX_DA_GROUP_ID) || run.status !== "PREVIEW" || run.expiresAt <= now) throw new Error("This preview expired or was already applied. Create a fresh preview.");
      const claimed = await tx.robloxRosterSyncRun.updateMany({ where: { id, status: "PREVIEW", expiresAt: { gt: now } }, data: { status: "APPLYING" } });
      if (claimed.count !== 1) throw new Error("This preview is already being applied. Refresh the sync page.");
      const data = livePreview;
      const allTargets: ({ kind: "add"; item: Candidate } | { kind: "update"; item: SyncPreview["updates"][number] })[] = [
        ...data.additions.map((item) => ({ kind: "add" as const, item })),
        ...data.updates.map((item) => ({ kind: "update" as const, item })),
      ];

      // Revalidate the previewed records before making any changes; a concurrent edit requires a fresh preview.
      for (const change of allTargets) {
        const revoked = await tx.revokedStaffAccess.findUnique({ where: { robloxUserId: change.item.userId }, select: { robloxUserId: true } });
        if (revoked) throw new Error(`${change.item.username}'s site access was revoked after preview. Generate a fresh preview.`);
        const existing = await tx.rosterEntry.findUnique({ where: { robloxUserId: change.item.userId } });
        if (change.kind === "add" && existing) throw new Error(`${change.item.username} was added to the roster after preview. Generate a fresh preview.`);
        if (change.kind === "update") {
          const row = await tx.rosterEntry.findUnique({ where: { id: change.item.entryId } });
          if (!row || (row.robloxUserId && row.robloxUserId !== change.item.userId)) throw new Error(`${change.item.username}'s roster record changed after preview. Generate a fresh preview.`);
        }
      }
      for (const change of data.inactivations) {
        const row = await tx.rosterEntry.findUnique({ where: { id: change.entryId } });
        if (!row || !row.isActive || !row.robloxSynced || row.robloxUserId !== change.username) throw new Error(`${change.name}'s roster record changed after preview. Generate a fresh preview.`);
      }

      for (const change of allTargets) {
        const item = change.item;
        const existing = change.kind === "update" ? await tx.rosterEntry.findUnique({ where: { id: change.item.entryId }, select: { rankOverride: true } }) : null;
        const syncedFields = { name: item.username, rank: existing?.rankOverride ?? item.roleName, robloxRoleName: item.roleName, robloxUserId: item.userId, robloxSynced: true, robloxRoleId: String(item.roleId), robloxRank: item.rank, lastRobloxSyncAt: now, isActive: true };
        const roster = change.kind === "add"
          ? await tx.rosterEntry.create({ data: { ...syncedFields, unit: null } })
          : await tx.rosterEntry.update({ where: { id: change.item.entryId }, data: syncedFields });
        await tx.user.updateMany({ where: { robloxUserId: item.userId }, data: { division: roster.unit, divisionGroup: roster.divisionGroup } });
      }
      for (const change of data.unchanged) {
        const roster = await tx.rosterEntry.update({ where: { id: change.entryId }, data: { lastRobloxSyncAt: now } });
        await tx.user.updateMany({ where: { robloxUserId: change.userId }, data: { division: roster.unit, divisionGroup: roster.divisionGroup } });
      }
      for (const change of data.inactivations) {
        const current = await tx.rosterEntry.findUnique({ where: { id: change.entryId }, select: { rankOverride: true } });
        await tx.rosterEntry.update({ where: { id: change.entryId }, data: { isActive: false, rank: current?.rankOverride ?? (change.newRank === "Not in group" ? undefined : change.newRank), robloxRoleName: change.newRank === "Not in group" ? null : change.newRank, lastRobloxSyncAt: now, robloxRoleId: change.newRoleId === null ? null : String(change.newRoleId), robloxRank: change.rankNumber } });
      }
      await tx.robloxRosterSyncRun.update({ where: { id }, data: { status: "APPLIED", previewData: JSON.stringify(data), appliedAt: now } });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Roster sync could not be applied.";
    await prisma.robloxRosterSyncRun.updateMany({ where: { id, actorName: session.user.displayName, groupId: String(ROBLOX_DA_GROUP_ID), status: "PREVIEW" }, data: { status: "FAILED", previewData: JSON.stringify({ error: message.slice(0, 500) }) } });
    revalidatePath(syncPath);
    redirect(`${syncPath}?sync=${encodeURIComponent(id)}&failed=1`);
  }
  revalidatePath(syncPath);
  revalidatePath("/dashboard/roster");
  revalidatePath("/dashboard");
  redirect(`${syncPath}?sync=${encodeURIComponent(id)}&applied=1`);
}

export async function previewRobloxRosterSync() { return runWithActionDebug("previewRobloxRosterSync", [], () => previewRobloxRosterSyncImpl()); }
export async function applyRobloxRosterSync(formData: FormData) { return runWithActionDebug("applyRobloxRosterSync", [formData], () => applyRobloxRosterSyncImpl(formData)); }

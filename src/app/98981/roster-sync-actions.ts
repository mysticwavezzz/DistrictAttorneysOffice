"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runWithActionDebug } from "@/lib/action-debug";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { PERMISSION_TIERS } from "@/lib/permissions/tiers";
import { fetchRobloxGroupMembers, type RobloxGroupMember } from "@/lib/roblox/groups";
import { ROBLOX_DA_GROUP_ID, ROBLOX_TIER_ROLE_MAPPINGS } from "@/config/roblox-role-mappings";
import { normalizeRobloxTierRoleMappings } from "@/config/role-mapping-migrations";
import { getSiteConfiguration } from "@/lib/site-settings";

const SYNC_TIERS: ReadonlySet<string> = new Set([
  PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.DISTRICT_ATTORNEY,
]);
const PREVIEW_MINUTES = 15;
const syncPath = "/98981/roster-sync";

type Candidate = RobloxGroupMember & { unitBefore: string | null };
type SyncPreview = {
  fetchedCount: number;
  eligibleCount: number;
  additions: Candidate[];
  updates: (Candidate & { entryId: string; oldName: string; oldRank: string | null; wasActive: boolean; wasSynced: boolean })[];
  inactivations: { entryId: string; name: string; username: string; oldRank: string | null; newRank: string; newRoleId: number | null; rankNumber: number | null; reason: string }[];
  unchanged: (Candidate & { entryId: string })[];
  exceptions: { username?: string; userId?: string; reason: string }[];
};

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) throw new Error("Forbidden");
  return session;
}

async function buildPreview(members: RobloxGroupMember[]): Promise<SyncPreview> {
  const savedMappings = await getSiteConfiguration("robloxTierRoleMappings", ROBLOX_TIER_ROLE_MAPPINGS);
  const mappings = normalizeRobloxTierRoleMappings(savedMappings);
  const eligibleRoleIds = new Set(mappings
    .filter((mapping) => mapping.groupId === ROBLOX_DA_GROUP_ID && SYNC_TIERS.has(mapping.tier))
    .flatMap((mapping) => mapping.roleIds));
  if (!eligibleRoleIds.size) throw new Error("No ADA-or-higher Roblox role IDs are configured for the District Attorney group. No roster changes were prepared.");

  const entries = await prisma.rosterEntry.findMany({ select: { id: true, name: true, rank: true, unit: true, robloxUserId: true, robloxSynced: true, robloxRoleId: true, robloxRank: true, isActive: true } });
  const byRobloxId = new Map(entries.flatMap((entry) => entry.robloxUserId ? [[entry.robloxUserId, entry] as const] : []));
  const byName = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = entry.name.trim().toLocaleLowerCase("en-US");
    byName.set(key, [...(byName.get(key) ?? []), entry]);
  }
  const snapshotIds = new Set(members.map((member) => member.userId));
  const currentMembers = new Map(members.map((member) => [member.userId, member]));
  const preview: SyncPreview = { fetchedCount: members.length, eligibleCount: 0, additions: [], updates: [], inactivations: [], unchanged: [], exceptions: [] };

  for (const member of members) {
    const eligible = eligibleRoleIds.has(member.roleId);
    const existing = byRobloxId.get(member.userId);
    if (!eligible) {
      if (existing?.robloxSynced && existing.isActive) preview.inactivations.push({ entryId: existing.id, name: existing.name, username: member.username, oldRank: existing.rank, newRank: member.roleName, newRoleId: member.roleId, rankNumber: member.rank, reason: "Roblox group role is below the configured ADA threshold." });
      continue;
    }
    preview.eligibleCount++;
    const nameMatches = existing ? [] : byName.get(member.username.trim().toLocaleLowerCase("en-US")) ?? [];
    if (nameMatches.length > 1) {
      preview.exceptions.push({ username: member.username, userId: member.userId, reason: "Multiple roster entries have this Roblox username. Link the correct Roblox user ID manually before syncing." });
      continue;
    }
    const matched = existing ?? nameMatches[0];
    if (matched?.robloxUserId && matched.robloxUserId !== member.userId) {
      preview.exceptions.push({ username: member.username, userId: member.userId, reason: "A roster record with this username is linked to a different Roblox user ID. Review and correct the identity link before syncing." });
      continue;
    }
    const candidate: Candidate = { ...member, unitBefore: matched?.unit ?? null };
    if (!matched) {
      preview.additions.push(candidate);
      continue;
    }
    const needsUpdate = matched.name !== member.username || matched.rank !== member.roleName || matched.robloxUserId !== member.userId || matched.robloxRoleId !== String(member.roleId) || matched.robloxRank !== member.rank || !matched.isActive || !matched.robloxSynced;
    if (needsUpdate) preview.updates.push({ ...candidate, entryId: matched.id, oldName: matched.name, oldRank: matched.rank, wasActive: matched.isActive, wasSynced: matched.robloxSynced });
    else preview.unchanged.push({ ...candidate, entryId: matched.id });
  }

  for (const entry of entries) {
    if (!entry.robloxSynced || !entry.isActive || !entry.robloxUserId) continue;
    if (snapshotIds.has(entry.robloxUserId)) {
      const member = currentMembers.get(entry.robloxUserId)!;
      if (eligibleRoleIds.has(member.roleId)) continue;
      // The role-change operation above already records this entry.
      continue;
    }
    preview.inactivations.push({ entryId: entry.id, name: entry.name, username: entry.robloxUserId, oldRank: entry.rank, newRank: "Not in group", newRoleId: null, rankNumber: null, reason: "Roblox account is no longer a member of the configured group." });
  }
  return preview;
}

async function previewRobloxRosterSyncImpl() {
  const session = await requireAdmin();
  let run;
  try {
    // A complete paginated snapshot is required before any removal can be proposed.
    const members = await fetchRobloxGroupMembers(ROBLOX_DA_GROUP_ID);
    const preview = await buildPreview(members);
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
    const livePreview = await buildPreview(liveMembers);
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
        const syncedFields = { name: item.username, rank: item.roleName, robloxUserId: item.userId, robloxSynced: true, robloxRoleId: String(item.roleId), robloxRank: item.rank, lastRobloxSyncAt: now, isActive: true };
        const roster = change.kind === "add"
          ? await tx.rosterEntry.create({ data: { ...syncedFields, unit: null } })
          : await tx.rosterEntry.update({ where: { id: change.item.entryId }, data: syncedFields });
        await tx.user.updateMany({ where: { robloxUserId: item.userId }, data: { division: roster.unit } });
      }
      for (const change of data.unchanged) {
        const roster = await tx.rosterEntry.update({ where: { id: change.entryId }, data: { lastRobloxSyncAt: now } });
        await tx.user.updateMany({ where: { robloxUserId: change.userId }, data: { division: roster.unit } });
      }
      for (const change of data.inactivations) {
        await tx.rosterEntry.update({ where: { id: change.entryId }, data: { isActive: false, rank: change.newRank === "Not in group" ? undefined : change.newRank, lastRobloxSyncAt: now, robloxRoleId: change.newRoleId === null ? null : String(change.newRoleId), robloxRank: change.rankNumber } });
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

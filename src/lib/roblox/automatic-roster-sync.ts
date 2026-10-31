import { prisma } from "@/lib/prisma";
import { getSiteConfiguration } from "@/lib/site-settings";
import { normalizeRobloxTierRoleMappings } from "@/config/role-mapping-migrations";
import { ROBLOX_DA_GROUP_ID, ROBLOX_TIER_ROLE_MAPPINGS } from "@/config/roblox-role-mappings";
import { PERMISSION_TIERS } from "@/lib/permissions/tiers";
import { fetchRobloxGroupMembers, type RobloxGroupMember } from "./groups";

const SYNC_TIERS: ReadonlySet<string> = new Set([
  PERMISSION_TIERS.SECRETARY,
  PERMISSION_TIERS.SECRETARY_SUPERVISOR,
  PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.EXECUTIVE_SECRETARY,
  PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY,
  PERMISSION_TIERS.DISTRICT_ATTORNEY,
]);

export type Candidate = RobloxGroupMember & { unitBefore: string | null };
export type SyncPreview = {
  fetchedCount: number;
  eligibleCount: number;
  additions: Candidate[];
  updates: (Candidate & { entryId: string; oldName: string; oldRank: string | null; wasActive: boolean; wasSynced: boolean })[];
  inactivations: { entryId: string; name: string; username: string; oldRank: string | null; newRank: string; newRoleId: number | null; rankNumber: number | null; reason: string }[];
  unchanged: (Candidate & { entryId: string })[];
  exceptions: { username?: string; userId?: string; reason: string }[];
};

let syncInProgress = false;

export async function buildRobloxRosterSyncPreview(members: RobloxGroupMember[]): Promise<SyncPreview> {
  const savedMappings = await getSiteConfiguration("robloxTierRoleMappings", ROBLOX_TIER_ROLE_MAPPINGS);
  const mappings = normalizeRobloxTierRoleMappings(savedMappings);
  const eligibleRoleIds = new Set(mappings
    .filter((mapping) => mapping.groupId === ROBLOX_DA_GROUP_ID && SYNC_TIERS.has(mapping.tier))
    .flatMap((mapping) => mapping.roleIds));
  if (!eligibleRoleIds.size) throw new Error("No ADA-or-higher Roblox role IDs are configured for the District Attorney group. No roster changes were applied.");

  const [entries, revokedAccounts] = await Promise.all([
    prisma.rosterEntry.findMany({ select: { id: true, name: true, rank: true, rankOverride: true, trainingAutoRankOverride: true, robloxRoleName: true, unit: true, robloxUserId: true, robloxSynced: true, robloxRoleId: true, robloxRank: true, isActive: true } }),
    prisma.revokedStaffAccess.findMany({ select: { robloxUserId: true } }),
  ]);
  const revokedIds = new Set(revokedAccounts.map((account) => account.robloxUserId));
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
    if (revokedIds.has(member.userId)) continue;
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
    const trainingOverrideCaughtUp = matched.trainingAutoRankOverride && member.roleName === "Assistant District Attorney";
    const needsUpdate = matched.name !== member.username || matched.rank !== (matched.rankOverride ?? member.roleName) || matched.robloxRoleName !== member.roleName || matched.robloxUserId !== member.userId || matched.robloxRoleId !== String(member.roleId) || matched.robloxRank !== member.rank || !matched.isActive || !matched.robloxSynced || trainingOverrideCaughtUp;
    if (needsUpdate) preview.updates.push({ ...candidate, entryId: matched.id, oldName: matched.name, oldRank: matched.rank, wasActive: matched.isActive, wasSynced: matched.robloxSynced });
    else preview.unchanged.push({ ...candidate, entryId: matched.id });
  }

  for (const entry of entries) {
    if (!entry.robloxSynced || !entry.isActive || !entry.robloxUserId) continue;
    if (snapshotIds.has(entry.robloxUserId)) {
      const member = currentMembers.get(entry.robloxUserId)!;
      if (eligibleRoleIds.has(member.roleId)) continue;
      continue;
    }
    preview.inactivations.push({ entryId: entry.id, name: entry.name, username: entry.robloxUserId, oldRank: entry.rank, newRank: "Not in group", newRoleId: null, rankNumber: null, reason: "Roblox account is no longer a member of the configured group." });
  }
  return preview;
}

/** Apply a complete Roblox group snapshot on the production server. Manual rank overrides and unit/group assignments are preserved. */
export async function runAutomaticRobloxRosterSync(): Promise<void> {
  if (syncInProgress) return;
  syncInProgress = true;
  const now = new Date();
  const actorName = "Automatic Roblox Group Sync";
  try {
    // This function only returns after every page has been fetched. Any API or
    // pagination error exits before the database transaction starts.
    const members = await fetchRobloxGroupMembers(ROBLOX_DA_GROUP_ID);
    const preview = await buildRobloxRosterSyncPreview(members);

    await prisma.$transaction(async (tx) => {
      const allTargets: ({ kind: "add"; item: Candidate } | { kind: "update"; item: SyncPreview["updates"][number] })[] = [
        ...preview.additions.map((item) => ({ kind: "add" as const, item })),
        ...preview.updates.map((item) => ({ kind: "update" as const, item })),
      ];

      // Recheck identity and revocation state immediately before applying the snapshot.
      for (const change of allTargets) {
        const revoked = await tx.revokedStaffAccess.findUnique({ where: { robloxUserId: change.item.userId }, select: { robloxUserId: true } });
        if (revoked) throw new Error(`${change.item.username}'s site access was revoked during sync.`);
        const existing = await tx.rosterEntry.findUnique({ where: { robloxUserId: change.item.userId } });
        if (change.kind === "add" && existing) throw new Error(`${change.item.username} was added to the roster during sync.`);
        if (change.kind === "update") {
          const row = await tx.rosterEntry.findUnique({ where: { id: change.item.entryId } });
          if (!row || (row.robloxUserId && row.robloxUserId !== change.item.userId)) throw new Error(`${change.item.username}'s roster identity changed during sync.`);
        }
      }
      for (const change of preview.inactivations) {
        const row = await tx.rosterEntry.findUnique({ where: { id: change.entryId } });
        if (!row || !row.isActive || !row.robloxSynced || row.robloxUserId !== change.username) throw new Error(`${change.name}'s roster record changed during sync.`);
      }

      for (const change of allTargets) {
        const item = change.item;
        const existing = change.kind === "update" ? await tx.rosterEntry.findUnique({ where: { id: change.item.entryId }, select: { rankOverride: true, trainingAutoRankOverride: true } }) : null;
        const clearTrainingOverride = Boolean(existing?.trainingAutoRankOverride && item.roleName === "Assistant District Attorney");
        const syncedFields = {
          name: item.username,
          rank: clearTrainingOverride ? item.roleName : existing?.rankOverride ?? item.roleName,
          ...(clearTrainingOverride ? { rankOverride: null, trainingAutoRankOverride: false } : {}),
          robloxRoleName: item.roleName,
          robloxUserId: item.userId,
          robloxSynced: true,
          robloxRoleId: String(item.roleId),
          robloxRank: item.rank,
          lastRobloxSyncAt: now,
          isActive: true,
        };
        const roster = change.kind === "add"
          ? await tx.rosterEntry.create({ data: { ...syncedFields, unit: null } })
          : await tx.rosterEntry.update({ where: { id: change.item.entryId }, data: syncedFields });
        await tx.user.updateMany({ where: { robloxUserId: item.userId }, data: { division: roster.unit, divisionGroup: roster.divisionGroup } });
      }
      for (const change of preview.unchanged) {
        const roster = await tx.rosterEntry.update({ where: { id: change.entryId }, data: { lastRobloxSyncAt: now } });
        await tx.user.updateMany({ where: { robloxUserId: change.userId }, data: { division: roster.unit, divisionGroup: roster.divisionGroup } });
      }
      for (const change of preview.inactivations) {
        const current = await tx.rosterEntry.findUnique({ where: { id: change.entryId }, select: { rankOverride: true } });
        await tx.rosterEntry.update({ where: { id: change.entryId }, data: {
          isActive: false,
          rank: current?.rankOverride ?? (change.newRank === "Not in group" ? undefined : change.newRank),
          robloxRoleName: change.newRank === "Not in group" ? null : change.newRank,
          lastRobloxSyncAt: now,
          robloxRoleId: change.newRoleId === null ? null : String(change.newRoleId),
          robloxRank: change.rankNumber,
        } });
      }

      // Keep the latest scheduled check visible without saving every unchanged
      // roster row in the sync-history JSON.
      await tx.robloxRosterSyncRun.create({
        data: {
          actorName,
          groupId: String(ROBLOX_DA_GROUP_ID),
          status: "APPLIED",
          previewData: JSON.stringify({ ...preview, unchanged: [] }),
          additions: preview.additions.length,
          updates: preview.updates.length,
          inactivations: preview.inactivations.length,
          exceptions: preview.exceptions.length,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
          appliedAt: now,
        },
      });
    });
    console.info(`Automatic Roblox roster sync completed: ${preview.additions.length} additions, ${preview.updates.length} updates, ${preview.inactivations.length} inactivations, ${preview.exceptions.length} exceptions.`);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Automatic Roblox roster sync failed.";
    console.error("Automatic Roblox roster sync failed", error);
    try {
      await prisma.robloxRosterSyncRun.create({ data: {
        actorName,
        groupId: String(ROBLOX_DA_GROUP_ID),
        status: "FAILED",
        previewData: JSON.stringify({ error: message }),
        exceptions: 1,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
      } });
    } catch (logError) {
      console.error("Could not record automatic Roblox roster sync failure", logError);
    }
  } finally {
    syncInProgress = false;
  }
}

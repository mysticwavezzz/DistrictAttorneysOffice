import { z } from "zod";
import type { RobloxGroupRole } from "./types";

const GROUPS_API_BASE = "https://groups.roblox.com/v1";

const robloxUserIdSchema = z
  .string()
  .regex(/^\d+$/, "Roblox user id must be a numeric string");

const groupRolesResponseSchema = z.object({
  data: z.array(
    z.object({
      group: z.object({
        id: z.number(),
        name: z.string(),
      }),
      role: z.object({
          id: z.number(),
          name: z.string(),
          rank: z.number(),
        }),
    })
  ),
});

const groupMembersResponseSchema = z.object({
  nextPageCursor: z.string().nullable().optional(),
  data: z.array(z.object({
    user: z.object({ userId: z.number().int().positive(), username: z.string().min(1), displayName: z.string().optional() }),
    role: z.object({ id: z.number().int().positive(), name: z.string().min(1), rank: z.number().int().min(0).max(255) }),
  })),
});

export interface RobloxGroupMember {
  userId: string;
  username: string;
  displayName: string;
  roleId: number;
  roleName: string;
  rank: number;
}

export class RobloxApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RobloxApiError";
    this.status = status;
  }
}

export async function fetchRobloxGroupRoles(
  robloxUserId: string
): Promise<RobloxGroupRole[]> {
  const parsedId = robloxUserIdSchema.parse(robloxUserId);

  const res = await fetch(
    `${GROUPS_API_BASE}/users/${parsedId}/groups/roles`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new RobloxApiError(
      `Roblox Groups API returned ${res.status}`,
      res.status
    );
  }

  const json = groupRolesResponseSchema.parse(await res.json());

  return json.data.map((entry) => ({
    groupId: entry.group.id,
    groupName: entry.group.name,
    roleId: entry.role.id,
    roleName: entry.role.name,
    rank: entry.role.rank,
  }));
}

/** Fetch the complete public group membership snapshot or fail without returning partial results. */
export async function fetchRobloxGroupMembers(groupId: number): Promise<RobloxGroupMember[]> {
  if (!Number.isSafeInteger(groupId) || groupId <= 0) throw new Error("Invalid Roblox group ID");
  const members: RobloxGroupMember[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 250; page++) {
    const params = new URLSearchParams({ limit: "100", sortOrder: "Asc" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`${GROUPS_API_BASE}/groups/${groupId}/users?${params}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new RobloxApiError(`Roblox group members API returned ${response.status} on page ${page + 1}`, response.status);
    const json = groupMembersResponseSchema.parse(await response.json());
    members.push(...json.data.map(({ user, role }) => ({
      userId: String(user.userId),
      username: user.username,
      displayName: user.displayName ?? user.username,
      roleId: role.id,
      roleName: role.name,
      rank: role.rank,
    })));
    cursor = json.nextPageCursor ?? null;
    if (!cursor) return members;
    if (seenCursors.has(cursor)) throw new Error("Roblox returned a repeated group pagination cursor; sync was stopped safely.");
    seenCursors.add(cursor);
  }
  throw new Error("The group is larger than the safe sync limit of 25,000 members; no roster changes were applied.");
}

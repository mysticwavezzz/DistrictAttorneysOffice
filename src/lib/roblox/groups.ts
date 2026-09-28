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

export class RobloxApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RobloxApiError";
    this.status = status;
  }
}

/**
 * Looks up every group a Roblox user belongs to, and their role in each.
 * This is Roblox's public Groups API (no auth required) — group role data
 * is public regardless of the user's own privacy settings, so this works
 * for any signed-in user without extra OAuth scopes.
 */
export async function fetchRobloxGroupRoles(
  robloxUserId: string
): Promise<RobloxGroupRole[]> {
  const parsedId = robloxUserIdSchema.parse(robloxUserId);

  const res = await fetch(
    `${GROUPS_API_BASE}/users/${parsedId}/groups/roles`,
    {
      headers: { Accept: "application/json" },
      // Role changes (promotions/demotions) must take effect promptly for
      // an access-control decision, so never serve this from cache.
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
    roleName: entry.role.name,
    rank: entry.role.rank,
  }));
}

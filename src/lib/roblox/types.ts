export interface RobloxGroupRole {
  groupId: number;
  groupName: string;
  roleName: string;
  /** Roblox group rank, 0-255 (0 = not in group, 255 = group owner). */
  rank: number;
}

export interface RobloxProfile {
  robloxUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

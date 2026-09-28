export interface RobloxGroupRole {
  groupId: number;
  groupName: string;
  roleName: string;
  rank: number;
}

export interface RobloxProfile {
  robloxUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

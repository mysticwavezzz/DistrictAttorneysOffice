export const CAPABILITIES = {
  DASHBOARD_VIEW: "dashboard:view",
  CASES_VIEW: "cases:view",
  CASES_CREATE: "cases:create",
  CASES_EDIT: "cases:edit",
  CASES_DELETE: "cases:delete",
  CASES_MANAGE_STAFF: "cases:manage_staff",
  ROSTER_VIEW: "roster:view",
  ROSTER_MANAGE: "roster:manage",
  BULLETIN_VIEW: "bulletin:view",
  ANNOUNCEMENTS_MANAGE: "announcements:manage",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

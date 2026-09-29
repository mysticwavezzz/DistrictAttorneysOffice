export const CAPABILITIES = {
  DASHBOARD_VIEW: "dashboard:view",
  CASES_VIEW: "cases:view",
  CASES_VIEW_ALL: "cases:view_all",
  CASES_CREATE: "cases:create",
  CASES_EDIT: "cases:edit",
  CASES_DELETE: "cases:delete",
  CASES_ASSIGN: "cases:assign",
  CASES_PROPOSE_EDIT: "cases:propose_edit",
  CASES_APPROVE_EDITS: "cases:approve_edits",
  ROSTER_VIEW: "roster:view",
  ROSTER_MANAGE: "roster:manage",
  BULLETIN_VIEW: "bulletin:view",
  ANNOUNCEMENTS_MANAGE: "announcements:manage",
  REQUESTS_VIEW: "requests:view",
  ACTIVITY_VIEW: "activity:view",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

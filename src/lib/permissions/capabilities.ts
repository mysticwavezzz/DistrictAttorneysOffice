/**
 * Fine-grained actions the app can gate. Pages/components/API routes check
 * capabilities, not tiers directly — this is what lets a tier's access
 * change (or a brand-new tier be introduced) by editing `tiers.ts` alone.
 */
export const CAPABILITIES = {
  DASHBOARD_VIEW: "dashboard:view",
  CASES_VIEW: "cases:view",
  CASES_CREATE: "cases:create",
  CASES_EDIT: "cases:edit",
  CASES_DELETE: "cases:delete",
  CASES_MANAGE_STAFF: "cases:manage_staff",
  STAFF_DIRECTORY_VIEW: "staff_directory:view",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

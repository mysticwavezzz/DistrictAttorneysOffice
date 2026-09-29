import { CAPABILITIES, type Capability } from "@/lib/permissions/capabilities";

export interface RouteRule {
  prefix: string;
  capabilities: Capability[];
}

export const PROTECTED_ROUTES: RouteRule[] = [
  { prefix: "/dashboard/cases/requests", capabilities: [CAPABILITIES.CASES_APPROVE_EDITS] },
  { prefix: "/dashboard/cases", capabilities: [CAPABILITIES.CASES_VIEW] },
  { prefix: "/dashboard/roster", capabilities: [CAPABILITIES.ROSTER_VIEW] },
  { prefix: "/dashboard/announcements", capabilities: [CAPABILITIES.ANNOUNCEMENTS_MANAGE] },
  { prefix: "/dashboard/records-requests", capabilities: [CAPABILITIES.REQUESTS_VIEW] },
  { prefix: "/dashboard/activity", capabilities: [CAPABILITIES.ACTIVITY_VIEW] },
  {
    prefix: "/dashboard/affidavits",
    capabilities: [CAPABILITIES.AOPC_SUBMIT, CAPABILITIES.AOPC_REVIEW],
  },
  { prefix: "/dashboard/search", capabilities: [CAPABILITIES.DASHBOARD_VIEW] },
  { prefix: "/dashboard", capabilities: [CAPABILITIES.DASHBOARD_VIEW] },
  { prefix: "/settings", capabilities: [CAPABILITIES.DASHBOARD_VIEW] },
  { prefix: "/98981", capabilities: [CAPABILITIES.SETTINGS_MANAGE] },
  { prefix: "/bulletin", capabilities: [CAPABILITIES.BULLETIN_VIEW] },
  {
    prefix: "/notifications",
    capabilities: [CAPABILITIES.DASHBOARD_VIEW, CAPABILITIES.BULLETIN_VIEW],
  },
];

export function findRouteRule(pathname: string): RouteRule | null {
  const matches = PROTECTED_ROUTES.filter(
    (rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)
  );
  if (matches.length === 0) return null;
  return matches.reduce((longest, rule) =>
    rule.prefix.length > longest.prefix.length ? rule : longest
  );
}

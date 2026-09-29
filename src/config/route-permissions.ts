import { CAPABILITIES, type Capability } from "@/lib/permissions/capabilities";

export interface RouteRule {
  prefix: string;
  capabilities: Capability[];
}

export const PROTECTED_ROUTES: RouteRule[] = [
  { prefix: "/dashboard/cases/requests", capabilities: [CAPABILITIES.CASES_APPROVE_EDITS] },
  { prefix: "/dashboard/cases", capabilities: [CAPABILITIES.CASES_VIEW] },
  { prefix: "/dashboard/roster", capabilities: [CAPABILITIES.ROSTER_VIEW] },
  { prefix: "/dashboard/bulletin", capabilities: [CAPABILITIES.BULLETIN_VIEW] },
  { prefix: "/dashboard/announcements", capabilities: [CAPABILITIES.ANNOUNCEMENTS_MANAGE] },
  { prefix: "/dashboard/notifications", capabilities: [CAPABILITIES.DASHBOARD_VIEW] },
  { prefix: "/dashboard", capabilities: [CAPABILITIES.DASHBOARD_VIEW] },
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

import { CAPABILITIES, type Capability } from "@/lib/permissions/capabilities";

export interface RouteRule {
  /** Path prefix this rule governs, e.g. "/dashboard/cases". */
  prefix: string;
  /** User needs at least one of these capabilities to access the route. */
  capabilities: Capability[];
}

/**
 * Declarative route -> capability map consumed by `middleware.ts`.
 * Rules are checked most-specific-prefix-first, so a nested route can
 * require a stricter capability than its parent without any branching
 * logic in the middleware itself. Adding a new protected section of the
 * site is just adding a row here.
 */
export const PROTECTED_ROUTES: RouteRule[] = [
  { prefix: "/dashboard/cases", capabilities: [CAPABILITIES.CASES_VIEW] },
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

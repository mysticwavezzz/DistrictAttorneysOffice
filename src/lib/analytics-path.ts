const TRACKED_PUBLIC_PATHS = new Set(["/", "/privacy-policy", "/terms-of-service", "/report-crime", "/records-request"]);

/** Restrict analytics to coarse public routes; never accept identifiers or query strings. */
export function trackedPublicPath(pathname: string): string | null {
  return TRACKED_PUBLIC_PATHS.has(pathname) ? pathname : null;
}

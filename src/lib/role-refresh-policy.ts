export const MAX_ROLE_STALENESS_MS = 2 * 60 * 1000;

export function mayUseCachedRoles(lastSuccessfulFetch: number | undefined, now: number): boolean {
  return typeof lastSuccessfulFetch === "number" && now >= lastSuccessfulFetch && now - lastSuccessfulFetch <= MAX_ROLE_STALENESS_MS;
}

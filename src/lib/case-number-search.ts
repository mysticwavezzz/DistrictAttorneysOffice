/** Return the canonical form only for a complete DA case number. */
export function normalizeExactCaseNumber(query: string): string | null {
  const normalized = query.trim().toUpperCase();
  return /^DA-\d{4}-\d{4,}$/.test(normalized) ? normalized : null;
}

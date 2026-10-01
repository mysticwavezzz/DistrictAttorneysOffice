/** Escape a spreadsheet cell and neutralize formula-like user-controlled values. */
export function escapeCsvCell(value: string): string {
  const safe = /^[\u0000-\u0020]*[=+@-]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

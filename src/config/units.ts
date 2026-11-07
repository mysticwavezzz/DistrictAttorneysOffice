export interface UnitOption {
  value: string;
  label: string;
  description: string;
  leaderRank?: string;
  acceptsAopc?: boolean;
}

export const UNITS: UnitOption[] = [
  {
    value: "Criminal Division",
    label: "Criminal Division",
    description: "Criminal prosecutions, supported by the Trial, Public Integrity, and Organized Crime Bureaus. Led by a Chief Assistant District Attorney.",
    leaderRank: "Chief Assistant District Attorney",
    acceptsAopc: true,
  },
  {
    value: "Civil Division",
    label: "Civil Division",
    description: "Handles civil litigation on behalf of the county. Led by the County Solicitor.",
    leaderRank: "County Solicitor",
  },
  {
    value: "Special Investigations Bureau",
    label: "Special Investigations Bureau",
    description: "Investigator intake, evidence collection, and report preparation under the Chief Investigator. Investigators do not make charging decisions or file court pleadings.",
    leaderRank: "Chief Investigator",
  },
  {
    value: "Administrative Services",
    label: "Administrative Services",
    description: "Paralegal assignments, employment tickets, expungement and vacatur support, and evidence organization. Overseen by the Deputy District Attorney with a Chief Paralegal managing support staff.",
    leaderRank: "Deputy District Attorney",
  },
];

export const LEGACY_BUREAU_UNITS: Record<string, string> = {
  "Public Integrity Bureau": "Public Integrity Bureau",
};

/** Keep saved legacy division options readable, but expose only current divisions. */
export function canonicalDivisionOptions(options: UnitOption[] | null | undefined): UnitOption[] {
  const source = Array.isArray(options) ? options : UNITS;
  const byValue = new Map(source.filter((unit) => !LEGACY_BUREAU_UNITS[unit.value]).map((unit) => [unit.value, unit]));
  for (const unit of UNITS) if (!byValue.has(unit.value)) byValue.set(unit.value, unit);
  return [...UNITS.map((unit) => ({ ...unit, ...(byValue.has(unit.value) ? { label: byValue.get(unit.value)!.label, description: byValue.get(unit.value)!.description } : {}) })), ...source.filter((unit) => !LEGACY_BUREAU_UNITS[unit.value] && !UNITS.some((current) => current.value === unit.value))];
}

/** Convert old standalone bureau placements to the current parent division + bureau model. */
export function normalizeDivisionPlacement(unit: string | null | undefined, bureau?: string | null): { unit: string | null; bureau: string | null } {
  if (unit && LEGACY_BUREAU_UNITS[unit]) return { unit: "Criminal Division", bureau: bureau || LEGACY_BUREAU_UNITS[unit]! };
  if (unit === "Special Investigations Bureau") return { unit, bureau: null };
  return { unit: unit || null, bureau: bureau || null };
}

export const AOPC_TARGET_UNITS = UNITS.filter((unit) => unit.acceptsAopc).map((unit) => unit.value);

export const UNIT_LEADER_RANK: Record<string, string> = {
  "Criminal Division": "Chief Assistant District Attorney",
  "Civil Division": "County Solicitor",
  "Special Investigations Bureau": "Chief Investigator",
  "Administrative Services": "Deputy District Attorney",
};

export function unitLabel(value: string | null | undefined): string {
  if (value && LEGACY_BUREAU_UNITS[value]) return "Criminal Division";
  return UNITS.find((u) => u.value === value)?.label ?? value ?? "Unassigned";
}

export interface LeadershipPosition {
  rank: string;
  unit: string | null;
  label: string;
}

export const LEADERSHIP_POSITIONS: LeadershipPosition[] = [
  { rank: "District Attorney", unit: null, label: "District Attorney" },
  { rank: "Deputy District Attorney", unit: null, label: "Deputy District Attorney" },
  ...UNITS.map((u) => ({
    rank: UNIT_LEADER_RANK[u.value]!,
    unit: u.value,
    label: `${UNIT_LEADER_RANK[u.value]} - ${u.label}`,
  })),
];

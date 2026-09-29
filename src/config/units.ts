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
    description: "Prosecutes general criminal matters for the county. Led by a Chief Assistant District Attorney.",
    leaderRank: "Chief Assistant District Attorney",
    acceptsAopc: true,
  },
  {
    value: "Civil Division",
    label: "Civil Division",
    description: "Handles civil litigation on behalf of the county. Led by a Chief Assistant District Attorney.",
    leaderRank: "Chief Assistant District Attorney",
  },
  {
    value: "Special Investigations Bureau",
    label: "Special Investigations Bureau",
    description:
      "Writes affidavits of probable cause and reviews criminal tips referred to the office. Led by a Chief Assistant District Attorney.",
    leaderRank: "Chief Assistant District Attorney",
  },
  {
    value: "Public Integrity Bureau",
    label: "Public Integrity Bureau",
    description:
      "Handles public corruption and government integrity matters. Led by a Supervisory Assistant District Attorney.",
    leaderRank: "Supervisory Assistant District Attorney",
    acceptsAopc: true,
  },
];

export const AOPC_TARGET_UNITS = UNITS.filter((unit) => unit.acceptsAopc).map((unit) => unit.value);

export const UNIT_LEADER_RANK: Record<string, string> = {
  "Criminal Division": "Chief Assistant District Attorney",
  "Civil Division": "Chief Assistant District Attorney",
  "Special Investigations Bureau": "Chief Assistant District Attorney",
  "Public Integrity Bureau": "Supervisory Assistant District Attorney",
};

export function unitLabel(value: string | null | undefined): string {
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

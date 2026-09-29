export interface UnitOption {
  value: string;
  label: string;
  description: string;
}

export const UNITS: UnitOption[] = [
  {
    value: "Criminal Division",
    label: "Criminal Division",
    description: "Prosecutes general criminal matters for the county. Led by a Chief Assistant District Attorney.",
  },
  {
    value: "Civil Division",
    label: "Civil Division",
    description: "Handles civil litigation on behalf of the county. Led by a Chief Assistant District Attorney.",
  },
  {
    value: "Special Investigations Bureau",
    label: "Special Investigations Bureau",
    description:
      "Writes affidavits of probable cause and reviews criminal tips referred to the office. Led by a Chief Assistant District Attorney.",
  },
  {
    value: "Public Integrity Bureau",
    label: "Public Integrity Bureau",
    description:
      "Handles public corruption and government integrity matters. Led by a Supervisory Assistant District Attorney.",
  },
];

export const AOPC_TARGET_UNITS = ["Criminal Division", "Public Integrity Bureau"];

export const UNIT_LEADER_RANK: Record<string, string> = {
  "Criminal Division": "Chief Assistant District Attorney - Criminal Division",
  "Civil Division": "Chief Assistant District Attorney - Civil Division",
  "Special Investigations Bureau": "Chief Assistant District Attorney - Special Investigations Bureau",
  "Public Integrity Bureau": "Supervisory Assistant District Attorney - Public Integrity Bureau",
};

export function unitLabel(value: string | null | undefined): string {
  return UNITS.find((u) => u.value === value)?.label ?? value ?? "Unassigned";
}

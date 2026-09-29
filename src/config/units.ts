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
    value: "Public Integrity Bureau",
    label: "Public Integrity Bureau",
    description: "Handles public corruption and government integrity matters. Led by a Supervising ADA.",
  },
  {
    value: "Special Investigations Bureau",
    label: "Special Investigations Bureau",
    description: "Writes AOPCs and reviews criminal tips referred to the office.",
  },
];

export const AOPC_TARGET_UNITS = ["Criminal Division", "Public Integrity Bureau"];

export function unitLabel(value: string | null | undefined): string {
  return UNITS.find((u) => u.value === value)?.label ?? value ?? "Unassigned";
}

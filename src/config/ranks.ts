export interface RankOption {
  value: string;
  label: string;
  isLeadership: boolean;
}

export const RANKS: RankOption[] = [
  { value: "District Attorney", label: "District Attorney", isLeadership: true },
  { value: "Deputy District Attorney", label: "Deputy District Attorney", isLeadership: true },
  {
    value: "Chief Assistant District Attorney - Criminal Division",
    label: "Chief Assistant District Attorney - Criminal Division",
    isLeadership: true,
  },
  {
    value: "Chief Assistant District Attorney - Civil Division",
    label: "Chief Assistant District Attorney - Civil Division",
    isLeadership: true,
  },
  {
    value: "Chief Assistant District Attorney - Special Investigations Bureau",
    label: "Chief Assistant District Attorney - Special Investigations Bureau",
    isLeadership: true,
  },
  {
    value: "Supervisory Assistant District Attorney - Public Integrity Bureau",
    label: "Supervisory Assistant District Attorney - Public Integrity Bureau",
    isLeadership: true,
  },
  { value: "Chief of Staff", label: "Chief of Staff", isLeadership: false },
  { value: "Assistant District Attorney", label: "Assistant District Attorney", isLeadership: false },
  { value: "Secretary", label: "Secretary", isLeadership: false },
  { value: "Paralegal", label: "Paralegal", isLeadership: false },
  { value: "Prosecutor in Training", label: "Prosecutor in Training", isLeadership: false },
  { value: "Paralegal in Training", label: "Paralegal in Training", isLeadership: false },
];

export function isLeadershipRank(rank: string | null | undefined): boolean {
  return RANKS.find((r) => r.value === rank)?.isLeadership ?? false;
}

export const LEADERSHIP_RANKS = RANKS.filter((r) => r.isLeadership);

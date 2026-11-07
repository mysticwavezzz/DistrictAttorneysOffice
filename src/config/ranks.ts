export interface RankOption {
  value: string;
  label: string;
  isLeadership: boolean;
}

export const RANKS: RankOption[] = [
  { value: "District Attorney", label: "District Attorney", isLeadership: true },
  { value: "Deputy District Attorney", label: "Deputy District Attorney", isLeadership: true },
  { value: "County Solicitor", label: "County Solicitor", isLeadership: true },
  { value: "Chief Investigator", label: "Chief Investigator", isLeadership: true },
  {
    value: "Chief Assistant District Attorney",
    label: "Chief Assistant District Attorney",
    isLeadership: true,
  },
  {
    value: "Senior Assistant District Attorney",
    label: "Senior Assistant District Attorney",
    isLeadership: true,
  },
  { value: "Executive Secretary", label: "Executive Secretary", isLeadership: true },
  { value: "Chief of Staff", label: "Chief of Staff", isLeadership: false },
  { value: "Assistant District Attorney", label: "Assistant District Attorney", isLeadership: false },
  { value: "Secretary", label: "Paralegal", isLeadership: false },
  { value: "Secretary Supervisor", label: "Chief Paralegal", isLeadership: true },
  { value: "Paralegal", label: "Paralegal", isLeadership: false },
  { value: "Prosecutor in Training", label: "Prosecutor in Training", isLeadership: false },
  { value: "Paralegal in Training", label: "Paralegal in Training", isLeadership: false },
];

export function isLeadershipRank(rank: string | null | undefined): boolean {
  return RANKS.find((r) => r.value === rank)?.isLeadership ?? false;
}

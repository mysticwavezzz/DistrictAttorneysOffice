import type { PermissionTier } from "@/lib/permissions/tiers";

export function requiresCriminalDivisionGroupForCaseCreation(tiers: PermissionTier[], division: string | null | undefined): boolean {
  return division === "Criminal Division" && tiers.some((tier) =>
    tier === "assistant_district_attorney" || tier === "da_attorney" || tier === "senior_assistant_district_attorney"
  );
}

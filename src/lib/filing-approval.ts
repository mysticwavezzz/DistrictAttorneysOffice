import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import type { PermissionTier } from "@/lib/permissions/tiers";

/** Review-capable staff may place their filings directly on the docket. */
export function shouldRequireFilingApproval(tiers: PermissionTier[], division?: string | null): boolean {
  if (hasCapability(tiers, CAPABILITIES.CASES_APPROVE_EDITS)) return false;
  if (division && hasCapability(tiers, CAPABILITIES.CASES_APPROVE_DIVISION)) return false;
  return true;
}

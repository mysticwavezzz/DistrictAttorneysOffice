import type { PermissionTier } from "@/lib/permissions/tiers";

/** Every filed document, including filings by review-capable staff, enters the review inbox. */
export function shouldRequireFilingApproval(_tiers: PermissionTier[], _division?: string | null): boolean {
  return true;
}

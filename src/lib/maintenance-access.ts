import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import type { PermissionTier } from "@/lib/permissions/tiers";

const MAINTENANCE_EXEMPT_PREFIXES = ["/maintenance", "/privacy-policy", "/terms-of-service"];
const PUBLIC_ASSET_PATTERN = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;

export function shouldRedirectToMaintenance(input: {
  pathname: string;
  callbackUrl?: string | null;
  enabled: boolean;
  user?: { discordUserId?: string; providerUserId?: string; tiers?: PermissionTier[] };
  exemptTiers: string[];
  exemptUserIds: string[];
}): boolean {
  const adminDatabasePath = input.pathname === "/98981" || input.pathname.startsWith("/98981/");
  const exemptPath = PUBLIC_ASSET_PATTERN.test(input.pathname) || MAINTENANCE_EXEMPT_PREFIXES.some(
    (prefix) => input.pathname === prefix || input.pathname.startsWith(`${prefix}/`)
  ) || (input.pathname === "/login" && Boolean(input.callbackUrl && (input.callbackUrl === "/98981" || input.callbackUrl.startsWith("/98981/"))));
  if (!input.enabled || exemptPath) return false;
  const userId = input.user?.providerUserId ?? input.user?.discordUserId;
  const exemptUser = Boolean(userId && input.exemptUserIds.includes(userId)) || Boolean(input.user?.tiers?.some((tier) => input.exemptTiers.includes(tier)));
  if (adminDatabasePath) return !(exemptUser && hasCapability(input.user?.tiers ?? [], CAPABILITIES.SETTINGS_MANAGE));
  if (exemptUser) return false;
  return true;
}

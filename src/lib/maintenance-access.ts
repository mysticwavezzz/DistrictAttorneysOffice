const MAINTENANCE_EXEMPT_PREFIXES = ["/98981", "/maintenance", "/privacy-policy", "/terms-of-service"];
const PUBLIC_ASSET_PATTERN = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;

export function shouldRedirectToMaintenance(input: {
  pathname: string;
  callbackUrl?: string | null;
  enabled: boolean;
  user?: { discordUserId?: string; providerUserId?: string; tiers?: string[] };
  exemptTiers: string[];
  exemptUserIds: string[];
}): boolean {
  const exemptPath = PUBLIC_ASSET_PATTERN.test(input.pathname) || MAINTENANCE_EXEMPT_PREFIXES.some(
    (prefix) => input.pathname === prefix || input.pathname.startsWith(`${prefix}/`)
  ) || (input.pathname === "/login" && Boolean(input.callbackUrl && (input.callbackUrl === "/98981" || input.callbackUrl.startsWith("/98981/"))));
  if (!input.enabled || exemptPath) return false;
  const userId = input.user?.providerUserId ?? input.user?.discordUserId;
  if (userId && input.exemptUserIds.includes(userId)) return false;
  if (input.user?.tiers?.some((tier) => input.exemptTiers.includes(tier))) return false;
  return true;
}

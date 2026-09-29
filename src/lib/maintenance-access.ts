const MAINTENANCE_EXEMPT_PREFIXES = ["/98981", "/maintenance"];
const PUBLIC_ASSET_PATTERN = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;

export function shouldRedirectToMaintenance(input: {
  pathname: string;
  callbackUrl?: string | null;
  enabled: boolean;
  user?: { discordUserId?: string; tiers?: string[] };
  exemptTiers: string[];
  exemptUserIds: string[];
}): boolean {
  const exemptPath = PUBLIC_ASSET_PATTERN.test(input.pathname) || MAINTENANCE_EXEMPT_PREFIXES.some(
    (prefix) => input.pathname === prefix || input.pathname.startsWith(`${prefix}/`)
  ) || (input.pathname === "/login" && Boolean(input.callbackUrl && (input.callbackUrl === "/98981" || input.callbackUrl.startsWith("/98981/"))));
  if (!input.enabled || exemptPath) return false;
  if (input.user?.discordUserId && input.exemptUserIds.includes(input.user.discordUserId)) return false;
  if (input.user?.tiers?.some((tier) => input.exemptTiers.includes(tier))) return false;
  return true;
}

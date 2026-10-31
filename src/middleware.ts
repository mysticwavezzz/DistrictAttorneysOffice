import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { findRouteRule } from "@/config/route-permissions";
import { hasAnyCapability } from "@/lib/permissions/resolve";
import { env } from "@/lib/env";
import { shouldRedirectToMaintenance } from "@/lib/maintenance-access";
import { applyRosterRankOverride } from "@/lib/staff-rank-control";
import { DEVELOPER_PROFILE_TIER, PERMISSION_TIERS } from "@/lib/permissions/tiers";

const { auth } = NextAuth(authConfig);

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https:",
    "connect-src 'self' blob:",
    "frame-src 'self' blob:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

const MAINTENANCE_CACHE_TTL_MS = 5000;

let maintenanceCache: { enabled: boolean; exemptTiers: string[]; exemptUserIds: string[]; expiresAt: number } | null = null;

async function getMaintenanceConfiguration(origin: string): Promise<{ enabled: boolean; exemptTiers: string[]; exemptUserIds: string[] }> {
  const now = Date.now();
  if (maintenanceCache && maintenanceCache.expiresAt > now) {
    return maintenanceCache;
  }
  try {
    const res = await fetch(new URL("/api/site-settings/status", origin), {
      cache: "no-store",
      headers: { "x-maintenance-check": env.AUTH_SECRET },
    });
    if (!res.ok) throw new Error(`Maintenance status returned ${res.status}`);
    const data = await res.json();
    maintenanceCache = {
      enabled: Boolean(data.maintenanceMode),
      exemptTiers: Array.isArray(data.exemptTiers) ? data.exemptTiers : [],
      exemptUserIds: Array.isArray(data.exemptUserIds) ? data.exemptUserIds : [],
      expiresAt: now + MAINTENANCE_CACHE_TTL_MS,
    };
    return maintenanceCache;
  } catch (error) {
    console.error("Failed to check maintenance mode", error);
    if (maintenanceCache && maintenanceCache.expiresAt > now) return maintenanceCache;
    // Database/settings health is unknown, so fail closed on public routes.
    return { enabled: true, exemptTiers: [], exemptUserIds: [] };
  }
}

export default auth(async (req) => {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const { pathname } = req.nextUrl;

  // Social crawlers cannot complete the staff sign-in flow. Give them a
  // deliberately minimal, public preview route for case links only.
  const casePreviewMatch = pathname.match(/^\/dashboard\/cases\/([^/]+)\/?$/);
  const userAgent = req.headers.get("user-agent") ?? "";
  const isLinkPreviewBot = /Discordbot|Twitterbot|Slackbot|facebookexternalhit|Facebot|TelegramBot|WhatsApp/i.test(userAgent);
  if (casePreviewMatch && isLinkPreviewBot) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    const previewUrl = new URL(`/share/cases/${encodeURIComponent(casePreviewMatch[1]!)}`, req.nextUrl.origin);
    const response = NextResponse.rewrite(previewUrl, { request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  let effectiveUser = req.auth?.user ?? null;
  if (effectiveUser?.robloxUserId) {
    try {
      const url = new URL("/api/staff-access/status", req.nextUrl.origin);
      url.searchParams.set("robloxUserId", effectiveUser.robloxUserId);
      const status = await fetch(url, { cache: "no-store", headers: { "x-staff-access-check": env.AUTH_SECRET } });
      if (!status.ok) throw new Error(`Staff access check returned ${status.status}`);
      const access = await status.json() as { revoked: boolean; rankOverride: string | null; isProsecutorInTraining?: boolean; orientationPending?: boolean };
      effectiveUser = access.revoked ? null : { ...effectiveUser, tiers: access.isProsecutorInTraining
        ? [PERMISSION_TIERS.PROSECUTOR_IN_TRAINING]
        : access.orientationPending ? [PERMISSION_TIERS.ATTORNEY_ORIENTATION_PENDING]
        : [...new Set([...applyRosterRankOverride((effectiveUser.groupTiers ?? effectiveUser.tiers).filter((tier) => tier !== PERMISSION_TIERS.PROSECUTOR_IN_TRAINING && tier !== PERMISSION_TIERS.ATTORNEY_ORIENTATION_PENDING), access.rankOverride), ...(effectiveUser.tiers.includes(DEVELOPER_PROFILE_TIER) ? [DEVELOPER_PROFILE_TIER] : [])])] };
    } catch (error) {
      console.error("Failed to verify staff access in middleware", error);
      effectiveUser = null;
    }
  }

  if (effectiveUser?.tiers.includes(PERMISSION_TIERS.PROSECUTOR_IN_TRAINING)
    && !pathname.startsWith("/dashboard/learning")
    && !pathname.startsWith("/api/training/")
    && !pathname.startsWith("/api/auth/")
    && pathname !== "/login") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "This account is restricted to the Criminal Division learning course." }, { status: 403 });
    return NextResponse.redirect(new URL("/dashboard/learning", req.nextUrl.origin));
  }
  if (effectiveUser?.tiers.includes(PERMISSION_TIERS.ATTORNEY_ORIENTATION_PENDING)
    && !pathname.startsWith("/dashboard/orientation")
    && !pathname.startsWith("/api/auth/")
    && pathname !== "/login") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Complete attorney orientation before using staff tools." }, { status: 403 });
    return NextResponse.redirect(new URL("/dashboard/orientation", req.nextUrl.origin));
  }

  const maintenance = await getMaintenanceConfiguration(req.nextUrl.origin);
  if (shouldRedirectToMaintenance({
    pathname,
    callbackUrl: req.nextUrl.searchParams.get("callbackUrl"),
    enabled: maintenance.enabled,
    user: effectiveUser ?? undefined,
    exemptTiers: maintenance.exemptTiers,
    exemptUserIds: maintenance.exemptUserIds,
  })) {
    const response = NextResponse.redirect(new URL("/maintenance", req.nextUrl.origin));
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const rule = findRouteRule(pathname);
  if (rule) {
    const user = effectiveUser;
    if (!user?.providerUserId) {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!hasAnyCapability(user.tiers, rule.capabilities)) {
      const forbiddenUrl = new URL("/login", req.nextUrl.origin);
      forbiddenUrl.searchParams.set("error", "forbidden");
      return NextResponse.redirect(forbiddenUrl);
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
});

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|api/staff-access/status|api/site-settings/status).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

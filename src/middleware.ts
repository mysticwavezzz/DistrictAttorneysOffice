import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { findRouteRule } from "@/config/route-permissions";
import { hasAnyCapability } from "@/lib/permissions/resolve";
import { env } from "@/lib/env";
import { shouldRedirectToMaintenance } from "@/lib/maintenance-access";

const { auth } = NextAuth(authConfig);

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
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

  const maintenance = await getMaintenanceConfiguration(req.nextUrl.origin);
  if (shouldRedirectToMaintenance({
    pathname,
    callbackUrl: req.nextUrl.searchParams.get("callbackUrl"),
    enabled: maintenance.enabled,
    user: req.auth?.user,
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
    const user = req.auth?.user;
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
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

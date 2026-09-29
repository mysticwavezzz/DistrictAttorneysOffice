import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { findRouteRule } from "@/config/route-permissions";
import { hasAnyCapability } from "@/lib/permissions/resolve";

const { auth } = NextAuth(authConfig);

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "frame-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

const MAINTENANCE_EXEMPT_PREFIXES = ["/98981", "/login", "/maintenance"];
const PUBLIC_ASSET_PATTERN = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;
const MAINTENANCE_CACHE_TTL_MS = 5000;

let maintenanceCache: { enabled: boolean; expiresAt: number } | null = null;

function isMaintenanceExempt(pathname: string): boolean {
  return PUBLIC_ASSET_PATTERN.test(pathname) || MAINTENANCE_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

async function isMaintenanceModeEnabled(origin: string): Promise<boolean> {
  const now = Date.now();
  if (maintenanceCache && maintenanceCache.expiresAt > now) {
    return maintenanceCache.enabled;
  }
  try {
    const res = await fetch(new URL("/api/site-settings/status", origin), { cache: "no-store" });
    const enabled = res.ok ? Boolean((await res.json()).maintenanceMode) : false;
    maintenanceCache = { enabled, expiresAt: now + MAINTENANCE_CACHE_TTL_MS };
    return enabled;
  } catch (error) {
    console.error("Failed to check maintenance mode", error);
    return false;
  }
}

export default auth(async (req) => {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const { pathname } = req.nextUrl;

  if (!isMaintenanceExempt(pathname) && (await isMaintenanceModeEnabled(req.nextUrl.origin))) {
    const response = NextResponse.rewrite(new URL("/maintenance", req.nextUrl.origin));
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const rule = findRouteRule(pathname);
  if (rule) {
    const user = req.auth?.user;
    if (!user?.discordUserId) {
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

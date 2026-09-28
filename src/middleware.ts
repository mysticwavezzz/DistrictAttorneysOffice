import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { findRouteRule } from "@/config/route-permissions";
import { hasAnyCapability } from "@/lib/permissions/resolve";

// Separate, edge-safe NextAuth instance built from the shared config
// (see auth.config.ts for why this isn't just `import { auth } from
// "@/lib/auth"`).
const { auth } = NextAuth(authConfig);

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // Next.js injects its own hydration/RSC bootstrap scripts inline with
    // no way to opt them into 'self'; a nonce (which Next.js automatically
    // attaches to the scripts/styles it controls once it sees one in this
    // header) lets us allow exactly those without 'unsafe-inline'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Inline `style="..."` attributes (used throughout for small dynamic
    // values like status-pill widths) aren't covered by a script nonce —
    // CSP has no attribute-level nonce mechanism, only 'unsafe-inline'.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https://tr.rbxcdn.com https://t0.rbxcdn.com https://t1.rbxcdn.com https://t2.rbxcdn.com https://t3.rbxcdn.com https://t4.rbxcdn.com https://t5.rbxcdn.com https://t6.rbxcdn.com https://t7.rbxcdn.com",
    "connect-src 'self'",
    "frame-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

export default auth((req) => {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const { pathname } = req.nextUrl;
  const rule = findRouteRule(pathname);
  if (rule) {
    const user = req.auth?.user;
    if (!user?.robloxUserId) {
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

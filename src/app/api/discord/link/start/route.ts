import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { localUser } from "@/lib/case-access";

const STATE_COOKIE = "discord_link_state";

function siteOrigin() {
  const configuredUrl = env.NEXT_PUBLIC_SITE_URL || env.AUTH_URL;
  if (!configuredUrl) throw new Error("Set NEXT_PUBLIC_SITE_URL or AUTH_URL before enabling Discord linking.");
  return new URL(configuredUrl).origin;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.robloxUserId || session.user.identityProvider !== "roblox") {
    return NextResponse.redirect(new URL("/login?callbackUrl=%2Fsettings", siteOrigin()));
  }

  const user = await localUser(session.user);
  if (!user) return NextResponse.redirect(new URL("/settings?discordLink=profileMissing", siteOrigin()));
  if (user.discordUserId) return NextResponse.redirect(new URL("/settings?discordLink=alreadyLinked", siteOrigin()));
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/settings?discordLink=notConfigured", siteOrigin()));
  }

  const origin = siteOrigin();
  const state = randomBytes(32).toString("base64url");
  const redirectUri = new URL("/api/discord/link/callback", origin).toString();
  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify",
    state,
  }).toString();

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/discord/link",
    maxAge: 600,
  });
  return response;
}

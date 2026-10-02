import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const STATE_COOKIE = "discord_link_state";
const discordTokenSchema = z.object({ access_token: z.string().min(1), token_type: z.string().min(1) });
const discordUserSchema = z.object({ id: z.string().regex(/^\d{5,30}$/) });

function settingsRedirect(request: NextRequest, result: string) {
  const configuredUrl = env.NEXT_PUBLIC_SITE_URL || env.AUTH_URL || request.nextUrl.origin;
  const response = NextResponse.redirect(new URL(`/settings?discordLink=${encodeURIComponent(result)}`, configuredUrl));
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: new URL(configuredUrl).protocol === "https:",
    sameSite: "lax",
    path: "/api/discord/link",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.robloxUserId || session.user.identityProvider !== "roblox") return settingsRedirect(request, "signInRequired");

  const returnedState = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!returnedState || !storedState || returnedState !== storedState) return settingsRedirect(request, "stateMismatch");
  if (request.nextUrl.searchParams.has("error")) return settingsRedirect(request, "cancelled");

  const code = request.nextUrl.searchParams.get("code");
  if (!code || !env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) return settingsRedirect(request, "notConfigured");

  const configuredUrl = env.NEXT_PUBLIC_SITE_URL || env.AUTH_URL || request.nextUrl.origin;
  const redirectUri = new URL("/api/discord/link/callback", configuredUrl).toString();
  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) return settingsRedirect(request, "oauthFailed");
    const token = discordTokenSchema.safeParse(await tokenResponse.json());
    if (!token.success) return settingsRedirect(request, "oauthFailed");

    const discordResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `${token.data.token_type} ${token.data.access_token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!discordResponse.ok) return settingsRedirect(request, "identityFailed");
    const discordUser = discordUserSchema.safeParse(await discordResponse.json());
    if (!discordUser.success) return settingsRedirect(request, "identityFailed");

    const currentUser = await prisma.user.findUnique({ where: { robloxUserId: session.user.robloxUserId }, select: { id: true, discordUserId: true } });
    if (!currentUser) return settingsRedirect(request, "profileMissing");
    if (currentUser.discordUserId) return settingsRedirect(request, currentUser.discordUserId === discordUser.data.id ? "success" : "alreadyLinked");

    const otherOwner = await prisma.user.findUnique({ where: { discordUserId: discordUser.data.id }, select: { id: true } });
    if (otherOwner && otherOwner.id !== currentUser.id) return settingsRedirect(request, "discordInUse");
    await prisma.user.update({ where: { id: currentUser.id }, data: { discordUserId: discordUser.data.id } });
    return settingsRedirect(request, "success");
  } catch (error) {
    console.error("Discord identity linking failed", error);
    return settingsRedirect(request, "oauthFailed");
  }
}

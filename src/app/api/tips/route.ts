import { NextRequest, NextResponse } from "next/server";
import { tipFormSchema } from "@/lib/validation/tip";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAllowedRequestOrigin } from "@/lib/http/request-origin";
import { prisma } from "@/lib/prisma";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { runWithActionDebug } from "@/lib/action-debug";
import { encryptCrimeTip } from "@/lib/crime-tip-encryption";
import { CAPABILITIES } from "@/lib/permissions";
import { notifyMany, userIdsWithCapability } from "@/lib/notifications";
import { auth } from "@/lib/auth";

const MIN_HUMAN_FILL_TIME_MS = 3_000;

function isSameOriginRequest(req: NextRequest): boolean {
  return isAllowedRequestOrigin({
    origin: req.headers.get("origin"),
    requestUrl: req.nextUrl.href,
    forwardedHost: req.headers.get("x-forwarded-host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
    host: req.headers.get("host"),
    configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

function normalizeTipIdentifier(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

async function postTip(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await auth();
  if (session?.user?.identityProvider !== "roblox" || !session.user.robloxUserId || !session.user.username) {
    return NextResponse.json({ error: "Sign in with Roblox before submitting a crime tip." }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = tipFormSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please check the form for errors and try again." }, { status: 400 });

  const { website, renderedAt, ...submittedTip } = parsed.data;
  const tip = {
    ...submittedTip,
    submitterRoblox: `${session.user.username} / ${session.user.robloxUserId}`,
    signature: session.user.username.toUpperCase(),
  };
  if (website) return NextResponse.json({ success: true });
  if (Date.now() - renderedAt < MIN_HUMAN_FILL_TIME_MS) return NextResponse.json({ error: "Please wait a moment and try submitting again." }, { status: 429 });
  if (Number.isNaN(Date.parse(tip.incidentDateTime))) return NextResponse.json({ error: "Please check the incident date." }, { status: 400 });

  const receipt = tip.submissionReference;
  const previous = await prisma.crimeTip.findUnique({ where: { reference: receipt }, select: { id: true } });
  if (previous) return NextResponse.json({ success: true, receipt, status: "received" });

  const robloxKey = normalizeTipIdentifier(session.user.robloxUserId);
  const discordKey = normalizeTipIdentifier(tip.submitterDiscord);
  const blacklist = await prisma.crimeTipBlacklist.findFirst({
    where: { OR: [{ kind: "roblox", identifierKey: `roblox:${robloxKey}` }, { kind: "discord", identifierKey: `discord:${discordKey}` }] },
    select: { id: true },
  });
  if (blacklist) return NextResponse.json({ error: "This submission cannot be accepted. Contact the site administrator if you believe this is an error." }, { status: 403 });

  const ip = clientIpFromHeaders(req.headers);
  const limits = await Promise.all([
    checkRateLimit(`tip:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000 }),
    checkRateLimit(`tip-hour:roblox:${robloxKey}`, { limit: 1, windowMs: 60 * 60 * 1000 }),
    checkRateLimit(`tip-hour:discord:${discordKey}`, { limit: 1, windowMs: 60 * 60 * 1000 }),
  ]);
  if (!limits[0]!.allowed) return NextResponse.json({ error: "Too many submissions from this connection. Please try again later." }, { status: 429 });
  if (!limits[1]!.allowed || !limits[2]!.allowed) return NextResponse.json({ error: "Only one tip may be submitted per hour for these submitter details." }, { status: 429 });

  try {
    const encryptedPayload = encryptCrimeTip(tip);
    await prisma.$transaction(async (tx) => {
      await tx.tipSubmission.create({ data: { reference: receipt, status: "SUBMITTED" } });
      await tx.crimeTip.create({ data: { reference: receipt, encryptedPayload, crimeType: tip.crimeType === "Other:" ? tip.crimeTypeOther : tip.crimeType, externalForwarding: "PORTAL_ONLY" } });
    });
  } catch (error) {
    const recovered = await prisma.crimeTip.findUnique({ where: { reference: receipt }, select: { id: true } }).catch(() => null);
    if (recovered) return NextResponse.json({ success: true, receipt, status: "received" });
    console.error("Crime-tip intake could not be saved.", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "The tip could not be safely received. Please try again later." }, { status: 503 });
  }

  try {
    const reviewers = await userIdsWithCapability(CAPABILITIES.TIPS_REVIEW);
    await notifyMany(reviewers, { type: "crime_tip", title: "New crime tip needs triage", body: "A new tip is ready in the restricted intake queue.", link: "/dashboard/review?type=tip" });
  } catch (error) {
    console.error("Crime tip saved, but reviewer notification failed.", error instanceof Error ? error.name : "unknown");
  }

  return NextResponse.json({ success: true, receipt, status: "received" });
}

export async function POST(req: NextRequest) {
  return runWithActionDebug("submitCrimeTip", [req], async (actionId) => {
    const response = await postTip(req);
    response.headers.set("x-action-id", actionId);
    return response;
  });
}

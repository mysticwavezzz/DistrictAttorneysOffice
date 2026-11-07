import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptCrimeTip, encryptTipAttachment } from "@/lib/crime-tip-encryption";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { isAllowedRequestOrigin } from "@/lib/http/request-origin";
import { CAPABILITIES } from "@/lib/permissions";
import { notifyMany, userIdsWithCapability } from "@/lib/notifications";

export const runtime = "nodejs";
const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "application/pdf", "text/plain"]);

function validOrigin(req: NextRequest) {
  return isAllowedRequestOrigin({ origin: req.headers.get("origin"), requestUrl: req.nextUrl.href, forwardedHost: req.headers.get("x-forwarded-host"), forwardedProto: req.headers.get("x-forwarded-proto"), host: req.headers.get("host"), configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL });
}

export async function POST(req: NextRequest) {
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await auth();
  if (session?.user?.identityProvider !== "roblox" || !session.user.robloxUserId || !session.user.username) {
    return NextResponse.json({ error: "Sign in with Roblox before submitting a gang tip." }, { status: 401 });
  }
  const limited = await checkRateLimit(`gang-tip:${clientIpFromHeaders(req.headers)}:${session.user.robloxUserId}`, { limit: 3, windowMs: 60 * 60 * 1000 });
  if (!limited.allowed) return NextResponse.json({ error: "You have reached the gang-tip submission limit. Try again later." }, { status: 429 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "The submission could not be read." }, { status: 400 }); }
  const members = String(form.get("suspectedGangMembers") ?? "").trim();
  const narrative = String(form.get("narrative") ?? "").trim();
  const gangName = String(form.get("suspectedGangName") ?? "").trim();
  const incidentDateTime = String(form.get("incidentDateTime") ?? "").trim();
  const location = String(form.get("location") ?? "").trim();
  const witnesses = String(form.get("witnesses") ?? "").trim();
  const evidenceLinks = String(form.get("evidenceLinks") ?? "").trim();
  const agreement = form.get("agreement") === "on";
  if (!members || members.length > 4000 || narrative.length < 20 || narrative.length > 8000 || gangName.length > 120 || location.length > 300 || witnesses.length > 2000 || evidenceLinks.length > 4000 || !agreement) {
    return NextResponse.json({ error: "Complete the required fields and accept the submission terms." }, { status: 400 });
  }
  if (incidentDateTime && Number.isNaN(Date.parse(incidentDateTime))) return NextResponse.json({ error: "Enter a valid incident date and time." }, { status: 400 });
  const urls = evidenceLinks.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (urls.some((value) => { try { const url = new URL(value); return !["https:", "http:"].includes(url.protocol); } catch { return true; } })) {
    return NextResponse.json({ error: "Evidence links must be valid HTTP or HTTPS URLs, one per line." }, { status: 400 });
  }
  const files = form.getAll("evidenceFiles").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length > MAX_FILES || files.some((file) => file.size > MAX_FILE_BYTES || !ALLOWED_TYPES.has(file.type))) {
    return NextResponse.json({ error: "Attach up to five JPG, PNG, WebP, GIF, MP4, WebM, PDF, or TXT files. Each file must be 5 MB or smaller." }, { status: 400 });
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) return NextResponse.json({ error: "The combined attachment limit is 15 MB." }, { status: 400 });

  const receipt = `HCG-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const actor = await prisma.user.findUnique({ where: { robloxUserId: session.user.robloxUserId }, select: { id: true } });
  if (!actor) return NextResponse.json({ error: "Your Roblox account is not ready for submissions. Refresh your sign-in and try again." }, { status: 403 });
  const payload = {
    submissionType: "GANG_TIP",
    submitterRoblox: `${session.user.username} / ${session.user.robloxUserId}`,
    suspectedGangName: gangName,
    suspectedGangMembers: members,
    incidentDateTime,
    location,
    narrative,
    witnesses,
    evidenceLinks: urls,
    agreement: true,
  };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.tipSubmission.create({ data: { reference: receipt, status: "SUBMITTED" } });
      const tip = await tx.crimeTip.create({ data: { reference: receipt, encryptedPayload: encryptCrimeTip(payload), category: "GANG", crimeType: "Gang tip", externalForwarding: "PORTAL_ONLY" } });
      await tx.crimeTipEvent.create({ data: { tipId: tip.id, actorId: actor.id, action: "SUBMITTED", note: "Gang tip submitted through authenticated intake." } });
      for (const file of files) {
        const bytes = Buffer.from(await file.arrayBuffer());
        await tx.crimeTipAttachment.create({ data: { tipId: tip.id, fileName: file.name.slice(0, 180), mimeType: file.type, byteSize: file.size, sha256: createHash("sha256").update(bytes).digest("hex"), encryptedData: encryptTipAttachment(bytes) } });
      }
    });
  } catch (error) {
    console.error("Gang tip intake could not be saved.", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "The report could not be safely received. Please try again later." }, { status: 503 });
  }
  try {
    const reviewers = await userIdsWithCapability(CAPABILITIES.TIPS_REVIEW);
    await notifyMany(reviewers, { type: "crime_tip", title: "New gang tip needs triage", body: "A gang tip is ready in the restricted intake queue.", link: "/dashboard/review?type=gang-tip" });
  } catch (error) { console.error("Gang tip saved, but reviewer notification failed.", error instanceof Error ? error.name : "unknown"); }
  return NextResponse.json({ success: true, receipt });
}

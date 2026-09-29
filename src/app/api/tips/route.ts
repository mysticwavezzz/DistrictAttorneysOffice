import { NextRequest, NextResponse } from "next/server";
import { tipFormSchema } from "@/lib/validation/tip";
import { checkRateLimit } from "@/lib/rate-limit";
import { CRIME_TIP_FORM, type CrimeTipFormConfiguration } from "@/config/crime-tip-form";
import { getSiteConfiguration } from "@/lib/site-settings";
import { isAllowedRequestOrigin } from "@/lib/http/request-origin";

const MIN_HUMAN_FILL_TIME_MS = 3_000;

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

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

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const ip = getClientIp(req);
  const rate = await checkRateLimit(`tip:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many submissions from this connection. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = tipFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the form for errors and try again." },
      { status: 400 }
    );
  }

  const { website, renderedAt, ...tip } = parsed.data;
  const form = await getSiteConfiguration<CrimeTipFormConfiguration>("crimeTipForm", CRIME_TIP_FORM);
  if (!form.crimeTypes.includes(tip.crimeType) || (tip.crimeType === "Other:" && !tip.crimeTypeOther.trim()) || Number.isNaN(Date.parse(tip.incidentDateTime))) {
    return NextResponse.json({ error: "Please check the incident type, date, and required details." }, { status: 400 });
  }

  const submittedTooFast = Date.now() - renderedAt < MIN_HUMAN_FILL_TIME_MS;
  if (website || submittedTooFast) {
    return NextResponse.json({ success: true });
  }

  if (!form.actionUrl || !form.entries || !form.actionUrl.startsWith("https://docs.google.com/forms/")) {
    return NextResponse.json({ error: "The online tip line is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  const formData = new URLSearchParams();
  const entry = form.entries;
  formData.set(entry.submitterRoblox, tip.submitterRoblox);
  formData.set(entry.submitterDiscord, tip.submitterDiscord);
  formData.set(entry.legalAcknowledgment, "I understand the above information and advisement that misuse of this form constitutes a violation of law. I wish to proceed in submitting a criminal tip.");
  formData.set(entry.crimeType, tip.crimeType === "Other:" ? "__other_option__" : tip.crimeType);
  if (tip.crimeType === "Other:" && tip.crimeTypeOther) {
    formData.set(`${entry.crimeType}.other_option_response`, tip.crimeTypeOther);
  }
  formData.set(entry.incidentDateTime, tip.incidentDateTime);
  formData.set(entry.location, tip.location);
  formData.set(entry.suspectRoblox, tip.suspectRoblox);
  formData.set(entry.suspectDiscord, tip.suspectDiscord);
  formData.set(entry.suspectInformation, tip.suspectInformation);
  formData.set(entry.narrative, tip.narrative);
  formData.set(entry.evidence, tip.evidence);
  formData.set(entry.witnesses, tip.witnesses);
  formData.set(entry.identityWaiver, "I do.");
  formData.set(entry.truthAffirmation, "I do.");
  formData.set(entry.signature, tip.signature);

  try {
    const formPage = await fetch(form.viewUrl, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!formPage.ok) throw new Error(`Google Form page returned ${formPage.status}`);
    const pageHtml = await formPage.text();
    const token = pageHtml.match(/name="fbzx" value="([^"]+)"/)?.[1];
    if (!token) throw new Error("Google Form submission token was not present");
    const res = await fetch(form.actionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: form.viewUrl },
      body: new URLSearchParams({ fvv: "1", partialResponse: JSON.stringify([null, null, token]), pageHistory: "0,1,2", fbzx: token, submissionTimestamp: "-1", ...Object.fromEntries(formData) }).toString(),
    });

    const confirmation = await res.text();
    if (!res.ok || !/response has been recorded/i.test(confirmation)) {
      throw new Error(`Google Forms responded with status ${res.status}`);
    }
  } catch (error) {
    console.error("Failed to forward tip submission to Google Forms", error);
    return NextResponse.json(
      { error: "We couldn't submit your tip right now. Please try again shortly." },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}

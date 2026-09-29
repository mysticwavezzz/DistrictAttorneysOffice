import { NextRequest, NextResponse } from "next/server";
import { tipFormSchema } from "@/lib/validation/tip";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";

const MIN_HUMAN_FILL_TIME_MS = 3_000;

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return origin === req.nextUrl.origin;
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

  const submittedTooFast = Date.now() - renderedAt < MIN_HUMAN_FILL_TIME_MS;
  if (website || submittedTooFast) {
    return NextResponse.json({ success: true });
  }

  if (!env.GOOGLE_FORM_ACTION_URL || !env.GOOGLE_FORM_ENTRY_DETAILS) {
    console.error(
      "Tip submission received but GOOGLE_FORM_ACTION_URL/GOOGLE_FORM_ENTRY_DETAILS is not configured."
    );
    return NextResponse.json(
      {
        error:
          "The online tip line is temporarily unavailable. Please call the office directly.",
      },
      { status: 503 }
    );
  }

  const formData = new URLSearchParams();
  if (env.GOOGLE_FORM_ENTRY_NAME && tip.name) {
    formData.set(env.GOOGLE_FORM_ENTRY_NAME, tip.name);
  }
  if (env.GOOGLE_FORM_ENTRY_CONTACT && tip.contact) {
    formData.set(env.GOOGLE_FORM_ENTRY_CONTACT, tip.contact);
  }
  if (env.GOOGLE_FORM_ENTRY_LOCATION && tip.location) {
    formData.set(env.GOOGLE_FORM_ENTRY_LOCATION, tip.location);
  }
  formData.set(env.GOOGLE_FORM_ENTRY_DETAILS, tip.details);

  try {
    const res = await fetch(env.GOOGLE_FORM_ACTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    if (res.status >= 500) {
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

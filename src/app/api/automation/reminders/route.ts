import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { sendDiscordCaseReminder, type ReminderType } from "@/lib/discord/case-reminders";
import { prisma } from "@/lib/prisma";

const postSchema = z.object({
  caseNumber: z.string().trim().min(1),
  type: z.enum([
    "INITIAL_FILING_APPROVED",
    "FILING_OVERDUE",
    "CASE_ASSIGNED",
    "DISCOVERY_DUE",
    "DISCOVERY_OVERDUE",
    "HEARING_UPCOMING",
    "FILING_RETURNED",
    "INACTIVITY_ALERT",
  ]),
  note: z.string().trim().max(1000).nullable().optional(),
}).strict();

export async function POST(request: Request) {
  const rawBody = await request.text();
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }

  const { actor } = authResult;
  if (!hasCapability(actor.tiers, CAPABILITIES.CASES_VIEW)) {
    return NextResponse.json({ error: "Forbidden: You lack case access." }, { status: 403 });
  }

  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid reminder payload." }, { status: 400 });

  const result = await sendDiscordCaseReminder(
    parsed.data.type as ReminderType,
    parsed.data.caseNumber,
    { note: parsed.data.note ?? undefined }
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    content: result.content,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const authResult = await authenticateLocalAutomationRequest(request, "");
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }

  const { actor } = authResult;
  if (!hasCapability(actor.tiers, CAPABILITIES.CASES_VIEW)) {
    return NextResponse.json({ error: "Forbidden: You lack case access." }, { status: 403 });
  }

  const url = new URL(request.url);
  const doDispatch = url.searchParams.get("dispatch") === "true";
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Cases with approved initial filings not filed in court > 24 hours
  const openCases = await prisma.case.findMany({
    where: {
      archived: false,
      assignedAttorneyId: { not: null },
      stage: { notIn: ["Closed - Dismissed", "Closed - Acquitted", "Closed - Plea Agreement", "Closed - Verdict"] },
    },
    include: {
      assignedAttorney: { select: { displayName: true, discordUserId: true } },
      filings: {
        where: { isInitial: true, status: "ACCEPTED" },
        select: { id: true, reviewedAt: true },
      },
    },
  });

  const alerts: { caseNumber: string; type: ReminderType; reason: string; attorney: string }[] = [];

  for (const c of openCases) {
    const initialApproved = c.filings[0];
    if (initialApproved && initialApproved.reviewedAt && initialApproved.reviewedAt < twentyFourHoursAgo && !c.courtFiledAt) {
      alerts.push({
        caseNumber: c.caseNumber,
        type: "FILING_OVERDUE",
        reason: `Initial filing approved on ${initialApproved.reviewedAt.toLocaleDateString()} has not been filed in court (>24h).`,
        attorney: c.assignedAttorney?.displayName ?? "Unassigned",
      });
    }

    if (c.updatedAt < sevenDaysAgo && !c.courtFiledAt) {
      alerts.push({
        caseNumber: c.caseNumber,
        type: "INACTIVITY_ALERT",
        reason: `Docket has had no activity or updates since ${c.updatedAt.toLocaleDateString()} (>7d).`,
        attorney: c.assignedAttorney?.displayName ?? "Unassigned",
      });
    }
  }

  const dispatchResults = [];
  if (doDispatch && alerts.length > 0) {
    for (const alert of alerts) {
      const res = await sendDiscordCaseReminder(alert.type, alert.caseNumber);
      dispatchResults.push({ caseNumber: alert.caseNumber, type: alert.type, sent: res.ok });
    }
  }

  return NextResponse.json({
    ok: true,
    count: alerts.length,
    dispatched: doDispatch,
    alerts,
    dispatchResults: doDispatch ? dispatchResults : undefined,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

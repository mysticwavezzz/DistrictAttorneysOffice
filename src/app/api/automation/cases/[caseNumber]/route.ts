import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { canAccessCase, canEditCase, canViewCases } from "@/lib/case-access";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  stage: z.string().trim().max(100).optional(),
  assignedJudge: z.string().trim().max(150).nullable().optional(),
  summary: z.string().trim().max(10000).optional(),
  disclosures: z.string().trim().max(10000).nullable().optional(),
  arraignmentAt: z.string().datetime().nullable().optional(),
  discGiven: z.string().datetime().nullable().optional(),
  discDue: z.string().datetime().nullable().optional(),
  pretrial: z.string().datetime().nullable().optional(),
  outcome: z.string().trim().max(2000).nullable().optional(),
  closedOn: z.string().datetime().nullable().optional(),
}).strict();

async function authenticate(request: Request, raw: string) {
  return authenticateLocalAutomationRequest(request, raw);
}

export async function GET(request: Request, { params }: { params: Promise<{ caseNumber: string }> }) {
  const result = await authenticate(request, await request.text());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  const { actor } = result;
  if (!canViewCases(actor.tiers)) return NextResponse.json({ error: "Your current role cannot view cases." }, { status: 403 });
  const { caseNumber } = await params;
  const record = await prisma.case.findUnique({
    where: { caseNumber },
    include: {
      assignedAttorney: { select: { id: true, displayName: true } },
      createdBy: { select: { id: true, displayName: true } },
      filings: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, url: true, pdfFileName: true, status: true, documentType: true, isInitial: true, submittedAt: true, reviewedAt: true, filedAt: true, courtFilingUrl: true, reviewNote: true, createdAt: true, addedBy: { select: { displayName: true } } } },
      comments: { orderBy: { createdAt: "asc" }, select: { id: true, body: true, isSystem: true, createdAt: true, author: { select: { displayName: true } } } },
      events: { orderBy: { startsAt: "asc" }, select: { id: true, title: true, kind: true, startsAt: true, endsAt: true, isCourtOrdered: true, details: true, sourceUrl: true } },
      evidence: { orderBy: { receivedAt: "asc" }, select: { id: true, title: true, kind: true, sourceName: true, sourceUrl: true, fileName: true, sha256: true, receivedAt: true, notes: true } },
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }], select: { id: true, title: true, details: true, sourceReference: true, status: true, dueAt: true, assignedToName: true } },
    },
  });
  if (!record || !canAccessCase(actor.tiers, actor.user.id, record, actor.user.division, actor.user.divisionGroup)) return NextResponse.json({ error: "Case not found or not accessible." }, { status: 404 });
  return NextResponse.json({ case: record }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ caseNumber: string }> }) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 20_000) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  const result = await authenticate(request, raw);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  const { actor } = result;
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid case update." }, { status: 400 });
  const { caseNumber } = await params;
  const record = await prisma.case.findUnique({ where: { caseNumber } });
  if (!record || !canAccessCase(actor.tiers, actor.user.id, record, actor.user.division, actor.user.divisionGroup)) return NextResponse.json({ error: "Case not found or not accessible." }, { status: 404 });
  if (!canEditCase(actor.tiers, actor.user.division, record.division)) return NextResponse.json({ error: "Your current role cannot edit this case." }, { status: 403 });
  if (record.isDraft || record.archived) return NextResponse.json({ error: "Draft or archived cases cannot be updated through local automation." }, { status: 409 });
  const { expectedUpdatedAt, ...input } = parsed.data;
  if (Math.abs(record.updatedAt.getTime() - new Date(expectedUpdatedAt).getTime()) > 1000) return NextResponse.json({ error: "Case changed since you loaded it; refresh and retry." }, { status: 409 });
  const data: Record<string, unknown> = {};
  for (const key of ["stage", "assignedJudge", "summary", "disclosures", "outcome"] as const) if (input[key] !== undefined) data[key] = input[key];
  for (const key of ["arraignmentAt", "discGiven", "discDue", "pretrial", "closedOn"] as const) if (input[key] !== undefined) data[key] = input[key] ? new Date(input[key]) : null;
  if (!Object.keys(data).length) return NextResponse.json({ error: "No case fields were provided." }, { status: 400 });
  const updatedAt = new Date();
  const update = await prisma.case.updateMany({ where: { id: record.id, updatedAt: record.updatedAt }, data: { ...data, updatedAt } as Prisma.CaseUpdateManyMutationInput });
  if (!update.count) return NextResponse.json({ error: "Case changed while saving; refresh and retry." }, { status: 409 });
  await prisma.caseComment.create({ data: { caseId: record.id, isSystem: true, body: `Case record updated by ${actor.user.displayName} using signed local portal automation (${Object.keys(data).join(", ")}).` } });
  revalidatePath("/dashboard/cases");
  revalidatePath(`/dashboard/cases/${record.id}`);
  return NextResponse.json({ updated: true, caseNumber, updatedAt: updatedAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

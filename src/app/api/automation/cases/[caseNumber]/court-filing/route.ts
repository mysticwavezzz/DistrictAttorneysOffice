import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { canAccessCase, canEditCase } from "@/lib/case-access";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

export async function POST(request: Request, { params }: { params: Promise<{ caseNumber: string }> }) {
  const raw = await request.text();
  if (raw.trim() && raw !== "{}") return NextResponse.json({ error: "This action takes no fields; it records the current filing date." }, { status: 400 });
  const result = await authenticateLocalAutomationRequest(request, raw);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  const { actor } = result;
  const { caseNumber } = await params;
  const record = await prisma.case.findUnique({ where: { caseNumber }, include: { filings: { where: { isInitial: true, status: "ACCEPTED" }, take: 1, select: { id: true } } } });
  if (!record || !canAccessCase(actor.tiers, actor.user.id, record, actor.user.division, actor.user.divisionGroup)) return NextResponse.json({ error: "Case not found or not accessible." }, { status: 404 });
  const mayRecord = canEditCase(actor.tiers, actor.user.division, record.division) || (hasCapability(actor.tiers, CAPABILITIES.CASES_CREATE) && record.createdById === actor.user.id);
  if (!mayRecord) return NextResponse.json({ error: "Your current role cannot record court filing on this case." }, { status: 403 });
  if (record.courtFiledAt) return NextResponse.json({ error: "Court filing is already recorded.", courtFiledAt: record.courtFiledAt }, { status: 409 });
  const initial = record.filings[0];
  if (!initial) return NextResponse.json({ error: "The initial Criminal Information must be approved in the portal first." }, { status: 409 });
  const filedAt = new Date();
  const changed = await prisma.$transaction(async (tx) => {
    const updatedCase = await tx.case.updateMany({ where: { id: record.id, courtFiledAt: null }, data: { courtFiledAt: filedAt, initialFilingDue: null, updatedAt: filedAt } });
    if (!updatedCase.count) return false;
    const updatedFiling = await tx.caseFiling.updateMany({ where: { id: initial.id, status: "ACCEPTED", filedAt: null }, data: { filedAt } });
    if (!updatedFiling.count) throw new Error("The approved initial filing has changed. Refresh the case and verify its filing timeline.");
    await tx.caseComment.create({ data: { caseId: record.id, isSystem: true, body: `Initial complaint marked filed in court on ${filedAt.toLocaleString("en-US", { timeZone: "America/New_York" })} by ${actor.user.displayName} using signed local portal automation.` } });
    return true;
  });
  if (!changed) return NextResponse.json({ error: "Court filing was recorded by another staff member. Refresh the case." }, { status: 409 });
  await logActivity(actor.user.displayName, "Marked initial complaint filed in court", "Case", record.caseNumber);
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/filings");
  revalidatePath(`/dashboard/cases/${record.id}`);
  return NextResponse.json({ recorded: true, caseNumber, filedAt: filedAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

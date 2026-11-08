import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { generateCaseNumber } from "@/lib/case-access";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { decryptCrimeTip } from "@/lib/crime-tip-encryption";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";

const convertSchema = z.object({
  title: z.string().trim().max(200).optional(),
  defendantName: z.string().trim().max(100).optional(),
  division: z.string().trim().default("Criminal Division"),
  divisionGroup: z.string().trim().optional(),
  assignedAttorneyId: z.string().trim().optional(),
  assignedJudge: z.string().trim().max(100).optional(),
  summary: z.string().trim().max(5000).optional(),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawBody = await request.text();
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }

  const { actor } = authResult;
  if (!hasCapability(actor.tiers, CAPABILITIES.CASES_CREATE)) {
    return NextResponse.json({ error: "Forbidden: You lack case creation capability." }, { status: 403 });
  }

  let body: unknown = {};
  if (rawBody.trim()) {
    try { body = JSON.parse(rawBody); }
    catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  }
  const parsed = convertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid convert parameters." }, { status: 400 });

  const { id } = await params;
  const tip = await prisma.crimeTip.findUnique({
    where: { id },
    include: { attachments: true },
  });

  if (!tip) {
    return NextResponse.json({ error: "Tip not found." }, { status: 404 });
  }

  if (tip.status === "OPENED_AS_CASE" && tip.linkedCaseId) {
    const existingCase = await prisma.case.findUnique({ where: { id: tip.linkedCaseId }, select: { caseNumber: true } });
    return NextResponse.json({
      error: `Tip is already opened as case ${existingCase?.caseNumber ?? tip.linkedCaseId}.`,
    }, { status: 409 });
  }

  let details: Record<string, unknown> = {};
  try {
    details = decryptCrimeTip(tip.encryptedPayload) as Record<string, unknown>;
  } catch {
    details = {};
  }

  const suspectName = parsed.data.defendantName
    || (typeof details.suspectRoblox === "string" ? details.suspectRoblox : null)
    || (typeof details.suspectDiscord === "string" ? details.suspectDiscord : null)
    || (typeof details.suspectedGangName === "string" ? details.suspectedGangName : null)
    || "Unknown Defendant";

  const caseTitle = parsed.data.title || `People v. ${suspectName}`;
  const division = parsed.data.division || "Criminal Division";
  const caseNumber = await generateCaseNumber();

  const narrative = typeof details.narrative === "string" ? details.narrative : "";
  const location = typeof details.location === "string" ? details.location : "";
  const incidentDate = typeof details.incidentDateTime === "string" ? details.incidentDateTime : "";
  const submitter = String(details.submitterRoblox || details.submitterDiscord || "Anonymous tipster");

  const caseSummary = parsed.data.summary || [
    `Originated from Crime Tip ${tip.reference} (${tip.category === "GANG" ? "Gang Intelligence" : tip.crimeType}).`,
    incidentDate ? `Incident Date/Time: ${incidentDate}` : "",
    location ? `Location: ${location}` : "",
    narrative ? `Narrative: ${narrative}` : "",
  ].filter(Boolean).join("\n\n");

  const partyDetails = JSON.stringify([
    { role: "Prosecution", name: "Harrison County District Attorney's Office" },
    { role: "Defendant", name: suspectName },
  ]);

  const assignedId = parsed.data.assignedAttorneyId || actor.user.id;
  const assignedJudge = parsed.data.assignedJudge || null;
  const divisionGroup = parsed.data.divisionGroup || actor.user.divisionGroup || null;

  const newCase = await prisma.$transaction(async (tx) => {
    const created = await tx.case.create({
      data: {
        caseNumber,
        title: caseTitle,
        type: "Criminal",
        division,
        divisionGroup,
        stage: "Investigation",
        summary: caseSummary,
        assignedAttorneyId: assignedId,
        assignedJudge,
        createdById: actor.user.id,
        partyDetails,
      },
    });

    await tx.crimeTip.update({
      where: { id },
      data: {
        status: "OPENED_AS_CASE",
        linkedCaseId: created.id,
        updatedAt: new Date(),
      },
    });

    await tx.crimeTipEvent.create({
      data: {
        tipId: id,
        actorId: actor.user.id,
        action: `Converted to case ${created.caseNumber}`,
        note: `Docket opened: ${created.title}`,
      },
    });

    await tx.caseComment.create({
      data: {
        caseId: created.id,
        body: `Case opened from Crime Tip ${tip.reference} (${tip.category === "GANG" ? "Gang Tip" : tip.crimeType}) by ${actor.user.displayName}. Submitter: ${submitter}.`,
        isSystem: true,
      },
    });

    return created;
  });

  await logActivity(
    actor.user.displayName,
    "Converted tip to case",
    "Case",
    `${newCase.caseNumber} · ${newCase.title} (Tip: ${tip.reference})`
  );

  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/cases");
  revalidatePath(`/dashboard/cases/${newCase.id}`);

  return NextResponse.json({
    ok: true,
    caseId: newCase.id,
    caseNumber: newCase.caseNumber,
    caseTitle: newCase.title,
    division: newCase.division,
    tipReference: tip.reference,
    tipId: tip.id,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

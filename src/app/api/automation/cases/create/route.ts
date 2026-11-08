import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { canAssignCase, generateCaseNumber } from "@/lib/case-access";
import { requiresCriminalDivisionGroupForCaseCreation } from "@/lib/criminal-case-assignment";
import { automaticallyAssignCase } from "@/lib/automatic-case-assignment";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";
import { validateCasePdf, MAX_CASE_PDF_BYTES } from "@/lib/filing-upload";
import { logActivity } from "@/lib/activity-log";
import { notify } from "@/lib/notifications";
import { sendDiscordCaseReminder } from "@/lib/discord/case-reminders";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 15_000_000;
const maxPdfBase64Length = Math.ceil(MAX_CASE_PDF_BYTES / 3) * 4;
const documentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(180),
  base64: z.string().min(24).max(maxPdfBase64Length),
}).strict();

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  defendantName: z.string().trim().min(1).max(100),
  coDefendants: z.array(z.string().trim().min(1).max(100)).max(19).default([]),
  division: z.string().trim().min(1).max(80),
  assignedJudge: z.string().trim().max(120).default(""),
  stage: z.string().trim().max(80).default("Intake"),
  summary: z.string().trim().max(4000).default(""),
  assignedAttorneyId: z.string().trim().max(100).default(""),
  openingFiling: documentSchema.nullable().optional(),
  criminalInformation: documentSchema.optional(),
  aopc: documentSchema,
}).strict();

function decodePdf(encoded: string): { bytes: Buffer; error: string | null } {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    return { bytes: Buffer.alloc(0), error: "PDF encoding is invalid." };
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) return { bytes: Buffer.alloc(0), error: "PDF encoding is invalid." };
  return { bytes, error: validateCasePdf(new Uint8Array(bytes)) };
}

function safePdfName(name: string): string {
  return name.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "document.pdf";
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request is too large. Each PDF must be 5 MB or smaller." }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Request is too large. Each PDF must be 5 MB or smaller." }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });

  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a title, defendant, division, and a separate AOPC PDF. An opening filing PDF is optional." }, { status: 400 });

  const { actor } = authResult;
  if (!hasCapability(actor.tiers, CAPABILITIES.CASES_CREATE)) {
    return NextResponse.json({ error: "Your current role cannot directly create case records." }, { status: 403 });
  }
  if (parsed.data.division !== "Criminal Division" || (actor.user.division !== parsed.data.division && !hasCapability(actor.tiers, CAPABILITIES.CASES_ASSIGN))) {
    return NextResponse.json({ error: "This command can only create Criminal Division cases within your authorized assignment scope." }, { status: 403 });
  }

  const openingFiling = parsed.data.openingFiling ?? parsed.data.criminalInformation ?? null;
  const initial = openingFiling ? decodePdf(openingFiling.base64) : null;
  const aopc = decodePdf(parsed.data.aopc.base64);
  if (initial?.error) return NextResponse.json({ error: `Opening filing: ${initial.error}` }, { status: 400 });
  if (aopc.error) return NextResponse.json({ error: `AOPC: ${aopc.error}` }, { status: 400 });
  const initialBase64 = initial?.bytes.toString("base64") ?? null;
  const aopcBase64 = aopc.bytes.toString("base64");
  const parties = [parsed.data.defendantName, ...parsed.data.coDefendants].map((name) => name.trim());
  if (new Set(parties.map((name) => name.toLowerCase())).size !== parties.length) {
    return NextResponse.json({ error: "A defendant name appears more than once." }, { status: 400 });
  }
  const partyDetails = JSON.stringify(parties.map((name, index) => ({ name, role: index === 0 ? "Defendant" : "Co-defendant" })));

  const existingByTitle = await prisma.case.findMany({
    where: { title: parsed.data.title, division: parsed.data.division, createdById: actor.user.id, archived: false },
    include: { filings: { where: { OR: [{ isInitial: true }, { documentType: "CRIMINAL_INFORMATION" }, { documentType: "AOPC" }] }, select: { documentType: true, isInitial: true, pdfData: true } } },
    take: 3,
  });
  if (existingByTitle.length) {
    const existing = existingByTitle[0];
    if (existingByTitle.length === 1 && existing) {
      const existingInitial = existing.filings.find((filing) => filing.isInitial || filing.documentType === "CRIMINAL_INFORMATION");
      const existingAopc = existing.filings.find((filing) => filing.documentType === "AOPC");
      if (existing.partyDetails === partyDetails && (openingFiling ? existingInitial?.pdfData === initialBase64 : !existingInitial?.pdfData) && existingAopc?.pdfData === aopcBase64) {
        return NextResponse.json({
          alreadyCreated: true,
          caseId: existing.id,
          caseNumber: existing.caseNumber,
          title: existing.title,
          assignedAttorneyId: existing.assignedAttorneyId,
          caseUrl: `/dashboard/cases/${existing.id}`,
          status: "UNFILED",
        }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    return NextResponse.json({ error: "A case with this title was already created by this account. Review it in the portal before retrying." }, { status: 409 });
  }

  const mayAssign = canAssignCase(actor.tiers, parsed.data.division);
  const restrictToGroup = actor.tiers.includes("senior_assistant_district_attorney") && !hasCapability(actor.tiers, CAPABILITIES.CASES_ASSIGN);
  const eligible = await getDivisionCaseAssignees(parsed.data.division, {
    divisionGroup: actor.user.divisionGroup,
    restrictToGroup,
  });
  let assignee = null as (typeof eligible)[number] | null;
  let assignmentReason = "Manually selected by authorized case opener.";
  if (parsed.data.assignedAttorneyId) {
    if (!mayAssign) return NextResponse.json({ error: "Your current role cannot choose a case assignee." }, { status: 403 });
    assignee = eligible.find((candidate) => candidate.id === parsed.data.assignedAttorneyId) ?? null;
    if (!assignee) return NextResponse.json({ error: "The selected assignee is not an active eligible attorney in your assignment scope." }, { status: 400 });
  } else {
    const automatic = await automaticallyAssignCase({
      division: parsed.data.division,
      divisionGroup: actor.user.divisionGroup,
      restrictToGroup,
      type: "Criminal",
      stage: parsed.data.stage,
    });
    assignee = eligible.find((candidate) => candidate.id === automatic.attorney.id) ?? null;
    if (!assignee) return NextResponse.json({ error: "Automatic assignment returned an attorney outside the eligible roster." }, { status: 409 });
    assignmentReason = `Automatically assigned to ${automatic.attorney.displayName} by workload: ${automatic.reason}.`;
  }
  if (!assignee) return NextResponse.json({ error: "No active eligible attorney is available for assignment." }, { status: 409 });

  const selectedAssignee = assignee;
  const divisionGroup = selectedAssignee.divisionGroup;
  if (requiresCriminalDivisionGroupForCaseCreation(actor.tiers, parsed.data.division) && !divisionGroup && !hasCapability(actor.tiers, CAPABILITIES.CASES_ASSIGN)) {
    return NextResponse.json({ error: "The selected attorney must be assigned to Criminal Division Group 1 or 2 before opening the case." }, { status: 409 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const caseNumber = await generateCaseNumber();
    const caseRecord = await tx.case.create({
      data: {
        caseNumber,
        title: parsed.data.title,
        type: "Criminal",
        stage: parsed.data.stage || "Intake",
        assignedJudge: parsed.data.assignedJudge || null,
        partyDetails,
        summary: parsed.data.summary,
        division: parsed.data.division,
        divisionGroup,
        assignedAttorneyId: selectedAssignee.id,
        createdById: actor.user.id,
      },
      select: { id: true, caseNumber: true, title: true, assignedAttorneyId: true },
    });
    await tx.caseFiling.createMany({
      data: [
        ...(openingFiling && initialBase64 ? [{ caseId: caseRecord.id, title: openingFiling.title, url: null, pdfData: initialBase64, pdfFileName: safePdfName(openingFiling.fileName), addedById: actor.user.id, status: "DRAFT" as const, isInitial: true, documentType: "OTHER" as const }] : []),
        { caseId: caseRecord.id, title: parsed.data.aopc.title, url: null, pdfData: aopcBase64, pdfFileName: safePdfName(parsed.data.aopc.fileName), addedById: actor.user.id, status: "DRAFT" as const, isInitial: false, documentType: "AOPC" as const },
      ],
    });
    await tx.caseComment.create({
      data: { caseId: caseRecord.id, isSystem: true, body: `Case opened as an unfiled staff record by ${actor.user.displayName}. ${assignmentReason}` },
    });
    return caseRecord;
  });

  await logActivity(actor.user.displayName, assignmentReason.startsWith("Automatically") ? "Opened and auto-assigned case" : "Opened case", "Case", `${created.caseNumber} · ${created.title}`);
  if (created.assignedAttorneyId && created.assignedAttorneyId !== actor.user.id) {
    try {
      await notify({ userId: created.assignedAttorneyId, type: "case_assigned", title: `You were assigned to ${created.caseNumber}`, body: created.title, link: `/dashboard/cases/${created.id}` });
    } catch (error) {
      console.error(`[local case creation ${created.id}] Case saved, but assignment notification failed.`, error);
    }
  }
  if (created.assignedAttorneyId) {
    try {
      await sendDiscordCaseReminder("CASE_ASSIGNED", created.caseNumber);
    } catch (error) {
      console.error(`[case create reminder] Discord reminder failed for ${created.caseNumber}`, error);
    }
  }
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/filings");
  return NextResponse.json({
    alreadyCreated: false,
    caseId: created.id,
    caseNumber: created.caseNumber,
    title: created.title,
    assignedAttorneyId: created.assignedAttorneyId,
    assignedAttorney: selectedAssignee.displayName,
    caseUrl: `/dashboard/cases/${created.id}`,
    status: "UNFILED",
    note: openingFiling ? "The opening filing and AOPC are attached as drafts. Nothing was filed with the court." : "The AOPC is attached as a draft. An opening filing can be added later. Nothing was filed with the court.",
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

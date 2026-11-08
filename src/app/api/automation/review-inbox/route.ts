import { NextResponse } from "next/server";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { canReviewDivision, caseVisibilityWhere } from "@/lib/case-access";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { decryptCrimeTip } from "@/lib/crime-tip-encryption";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authResult = await authenticateLocalAutomationRequest(request, "");
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }

  const { actor } = authResult;
  const canReviewAllCases = hasCapability(actor.tiers, CAPABILITIES.CASES_APPROVE_EDITS);
  const canReviewDivisionCases = hasCapability(actor.tiers, CAPABILITIES.CASES_APPROVE_DIVISION);
  const canReviewCases = canReviewAllCases || (canReviewDivisionCases && Boolean(actor.user.division));
  const canReviewTips = hasCapability(actor.tiers, CAPABILITIES.TIPS_REVIEW);

  if (!canReviewCases && !canReviewTips) {
    return NextResponse.json({ error: "Forbidden: You lack review permissions." }, { status: 403 });
  }

  const [pendingFilings, pendingAopcs, pendingRequests, pendingTips] = await Promise.all([
    canReviewCases
      ? prisma.caseFiling.findMany({
          where: { status: "PENDING" },
          select: {
            id: true,
            title: true,
            pdfFileName: true,
            isInitial: true,
            createdAt: true,
            caseId: true,
            case: {
              select: {
                caseNumber: true,
                title: true,
                division: true,
                divisionGroup: true,
                assignedAttorney: { select: { displayName: true, divisionGroup: true } },
                createdBy: { select: { displayName: true, divisionGroup: true } },
              },
            },
            addedBy: { select: { id: true, displayName: true } },
          },
          orderBy: { createdAt: "asc" },
          take: 100,
        })
      : [],
    canReviewCases
      ? prisma.aopc.findMany({
          where: { status: "PENDING", intakeTicketId: null },
          select: {
            id: true,
            documentType: true,
            reportId: true,
            title: true,
            targetUnit: true,
            subject: true,
            pdfFileName: true,
            documentUrl: true,
            linkedCaseId: true,
            createdAt: true,
            submittedBy: { select: { id: true, displayName: true } },
          },
          orderBy: { createdAt: "asc" },
          take: 100,
        })
      : [],
    canReviewCases
      ? prisma.caseActionRequest.findMany({
          where: { status: "PENDING" },
          include: {
            requestedBy: { select: { id: true, displayName: true, divisionGroup: true } },
            case: {
              select: {
                id: true,
                caseNumber: true,
                title: true,
                division: true,
                divisionGroup: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: 50,
        })
      : [],
    canReviewTips
      ? prisma.crimeTip.findMany({
          where: {
            status: { notIn: ["CLOSED", "NO_JURISDICTION", "DUPLICATE", "INSUFFICIENT"] },
          },
          include: {
            assignedTo: { select: { id: true, displayName: true } },
            attachments: { select: { id: true, fileName: true, byteSize: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [],
  ]);

  // Filter filings according to actor review authority
  const visibleFilings = pendingFilings.filter((filing) => {
    const filingGroup = filing.case.divisionGroup ?? filing.case.assignedAttorney?.divisionGroup ?? filing.case.createdBy.divisionGroup;
    return canReviewDivision(actor.tiers, actor.user.division, filing.case.division, actor.user.divisionGroup, filingGroup);
  }).map((filing) => ({
    id: filing.id,
    caseNumber: filing.case.caseNumber,
    caseTitle: filing.case.title,
    division: filing.case.division,
    title: filing.title,
    pdfFileName: filing.pdfFileName,
    isInitial: filing.isInitial,
    submittedBy: filing.addedBy.displayName,
    submittedById: filing.addedBy.id,
    createdAt: filing.createdAt.toISOString(),
  }));

  // Filter AOPCs according to actor authority
  const visibleAopcs = pendingAopcs.filter((aopc) => {
    return canReviewAllCases || aopc.targetUnit === actor.user.division;
  }).map((aopc) => ({
    id: aopc.id,
    documentType: aopc.documentType,
    reportId: aopc.reportId,
    title: aopc.title,
    subject: aopc.subject,
    targetUnit: aopc.targetUnit,
    pdfFileName: aopc.pdfFileName,
    linkedCaseId: aopc.linkedCaseId,
    submittedBy: aopc.submittedBy.displayName,
    submittedById: aopc.submittedBy.id,
    createdAt: aopc.createdAt.toISOString(),
  }));

  const visibleCaseRequests = pendingRequests.map((req) => {
    let proposedTitle = req.case?.title ?? "Case Request";
    try {
      const data = JSON.parse(req.proposedData);
      if (data && typeof data.title === "string") proposedTitle = data.title;
    } catch {}
    return {
      id: req.id,
      kind: req.kind,
      caseNumber: req.case?.caseNumber ?? null,
      title: proposedTitle,
      division: req.division,
      requestedBy: req.requestedBy.displayName,
      createdAt: req.createdAt.toISOString(),
    };
  });

  const visibleTips = pendingTips.map((tip) => {
    let summary = tip.crimeType;
    let submitter = "Public tipline";
    try {
      const detail = decryptCrimeTip(tip.encryptedPayload) as Record<string, unknown>;
      if (tip.category === "GANG") {
        summary = `Gang: ${detail.suspectedGangName || "Unknown"}`;
        submitter = String(detail.submitterRoblox || "Roblox verified");
      } else {
        submitter = String(detail.submitterDiscord || detail.submitterRoblox || "Public");
      }
    } catch {}

    return {
      id: tip.id,
      reference: tip.reference,
      category: tip.category,
      status: tip.status,
      crimeType: tip.crimeType,
      summary,
      submitter,
      assignedTo: tip.assignedTo?.displayName ?? null,
      attachmentsCount: tip.attachments.length,
      createdAt: tip.createdAt.toISOString(),
    };
  });

  return NextResponse.json({
    ok: true,
    counts: {
      filings: visibleFilings.length,
      aopcs: visibleAopcs.length,
      caseRequests: visibleCaseRequests.length,
      tips: visibleTips.length,
      total: visibleFilings.length + visibleAopcs.length + visibleCaseRequests.length + visibleTips.length,
    },
    filings: visibleFilings,
    aopcs: visibleAopcs,
    caseRequests: visibleCaseRequests,
    tips: visibleTips,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

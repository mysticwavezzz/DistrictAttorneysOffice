import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { canAccessCase, canViewCases } from "@/lib/case-access";
import { decodeCasePdf } from "@/lib/filing-upload";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ caseNumber: string; id: string }> },
) {
  const authResult = await authenticateLocalAutomationRequest(request, "");
  if (!authResult.ok) {
    return new Response(authResult.error, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }
  const { actor } = authResult;
  if (!canViewCases(actor.tiers)) {
    return new Response("Your current role cannot view case filings.", { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const { caseNumber, id } = await params;
  const filing = await prisma.caseFiling.findUnique({
    where: { id },
    select: {
      pdfData: true,
      pdfFileName: true,
      case: { select: { caseNumber: true, id: true, assignedAttorneyId: true, createdById: true, isDraft: true, division: true, divisionGroup: true } },
    },
  });
  if (!filing || filing.case.caseNumber !== caseNumber || !filing.pdfData) {
    return new Response("PDF filing not found for this case.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (!canAccessCase(actor.tiers, actor.user.id, filing.case, actor.user.division, actor.user.divisionGroup)) {
    return new Response("This filing is outside your case access.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const fileName = (filing.pdfFileName ?? "case-document.pdf").replace(/[\r\n"\\/]/g, "_");
  const pdf = Uint8Array.from(decodeCasePdf(filing.pdfData)).buffer as ArrayBuffer;
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser, canAccessCase, canReviewDivision } from "@/lib/case-access";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { decodeCasePdf } from "@/lib/filing-upload";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.providerUserId || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const user = await localUser(session.user);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const filing = await prisma.caseFiling.findUnique({
    where: { id },
    select: { pdfData: true, pdfFileName: true, status: true, addedById: true, case: { select: { id: true, assignedAttorneyId: true, createdById: true, isDraft: true, division: true, divisionGroup: true, assignedAttorney: { select: { divisionGroup: true } }, createdBy: { select: { divisionGroup: true } } } } },
  });
  const filingGroup = filing ? filing.case.divisionGroup ?? filing.case.assignedAttorney?.divisionGroup ?? filing.case.createdBy.divisionGroup : null;
  const canReviewPending = filing && canReviewDivision(session.user.tiers, user.division, filing.case.division, user.divisionGroup, filingGroup);
  const canSeePending = filing && filing.status !== "ACCEPTED" && (filing.addedById === user.id || canReviewPending);
  const canSeeAccepted = filing && filing.status === "ACCEPTED" && canAccessCase(session.user.tiers, user.id, filing.case, user.division, user.divisionGroup);
  if (!filing || !filing.pdfData || (!canSeePending && !canSeeAccepted)) {
    return new Response("Not found", { status: 404 });
  }
  const fileName = (filing.pdfFileName ?? "case-document.pdf").replace(/[\r\n"\\/]/g, "_");
  const body = Uint8Array.from(decodeCasePdf(filing.pdfData)).buffer as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

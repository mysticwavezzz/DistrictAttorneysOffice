import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser, canAccessCase, canReviewDivision, canViewCases } from "@/lib/case-access";
import { decodeCasePdf } from "@/lib/filing-upload";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const filing = await prisma.caseFiling.findUnique({
    where: { id },
    select: { pdfData: true, pdfFileName: true, status: true, documentType: true, addedById: true, case: { select: { id: true, assignedAttorneyId: true, createdById: true, isDraft: true, division: true, divisionGroup: true, assignedAttorney: { select: { divisionGroup: true } }, createdBy: { select: { divisionGroup: true } } } } },
  });
  if (!filing || !filing.pdfData) return new Response("Not found", { status: 404 });
  const approvedForLinkAccess = filing.status === "ACCEPTED" && !filing.case.isDraft;
  let user: Awaited<ReturnType<typeof localUser>> = null;
  let session = null;
  if (!approvedForLinkAccess) {
    session = await auth();
    if (!session?.user?.providerUserId || !canViewCases(session.user.tiers)) {
      return new Response("Unauthorized", { status: 401 });
    }
    user = await localUser(session.user);
    if (!user) return new Response("Unauthorized", { status: 401 });
  }
  const filingGroup = filing ? filing.case.divisionGroup ?? filing.case.assignedAttorney?.divisionGroup ?? filing.case.createdBy.divisionGroup : null;
  const canSeePending = !approvedForLinkAccess && session?.user && user && (filing.addedById === user.id || canReviewDivision(session.user.tiers, user.division, filing.case.division, user.divisionGroup, filingGroup) || (filing.documentType === "AOPC" && canAccessCase(session.user.tiers, user.id, filing.case, user.division, user.divisionGroup)));
  if (!approvedForLinkAccess && !canSeePending) {
    return new Response("Not found", { status: 404 });
  }
  const fileName = (filing.pdfFileName ?? "case-document.pdf").replace(/[\r\n"\\/]/g, "_");
  const body = Uint8Array.from(decodeCasePdf(filing.pdfData)).buffer as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": approvedForLinkAccess ? "public, max-age=0, must-revalidate" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

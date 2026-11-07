import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decodeCasePdf } from "@/lib/filing-upload";
import { localUser, canAccessCase, canReviewDivision, canViewCases } from "@/lib/case-access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.providerUserId || !canViewCases(session.user.tiers)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const viewer = await localUser(session.user);
  const aopc = await prisma.aopc.findUnique({
    where: { id },
    select: {
      pdfData: true,
      pdfFileName: true,
      targetUnit: true,
      status: true,
      submittedById: true,
      linkedCase: {
        select: {
          id: true,
          assignedAttorneyId: true,
          createdById: true,
          isDraft: true,
          division: true,
          divisionGroup: true,
          assignedAttorney: { select: { divisionGroup: true } },
          createdBy: { select: { divisionGroup: true } },
        },
      },
    },
  });
  if (!viewer || !aopc) return new Response("Not found", { status: 404 });
  const mayViewLinkedCase = aopc.linkedCase && canAccessCase(
    session.user.tiers,
    viewer.id,
    aopc.linkedCase,
    viewer.division,
    viewer.divisionGroup,
  );
  const mayReviewUnlinked = aopc.status === "PENDING" && (
    aopc.submittedById === viewer.id || canReviewDivision(
      session.user.tiers,
      viewer.division,
      aopc.targetUnit,
      viewer.divisionGroup,
      aopc.targetUnit === "Criminal Division" ? viewer.divisionGroup : null,
    )
  );
  if (!mayViewLinkedCase && !mayReviewUnlinked) return new Response("Not found", { status: 404 });
  if (!aopc?.pdfData) return new Response("Not found", { status: 404 });
  const fileName = (aopc.pdfFileName ?? "aopc.pdf").replace(/[\r\n"\\/]/g, "_");
  const body = Uint8Array.from(decodeCasePdf(aopc.pdfData)).buffer as ArrayBuffer;
  return new Response(body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { decodeCasePdf } from "@/lib/filing-upload";
import { localUser, canReviewDivision } from "@/lib/case-access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_DIVISION))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const viewer = await localUser(session.user);
  const aopc = await prisma.aopc.findFirst({ where: { id, status: "PENDING" }, select: { pdfData: true, pdfFileName: true, targetUnit: true } });
  if (!viewer || !aopc || !canReviewDivision(session.user.tiers, viewer.division, aopc.targetUnit, viewer.divisionGroup, aopc.targetUnit === "Criminal Division" ? viewer.divisionGroup : null)) return new Response("Not found", { status: 404 });
  if (!aopc?.pdfData) return new Response("Not found", { status: 404 });
  const fileName = (aopc.pdfFileName ?? "aopc.pdf").replace(/[\r\n"\\/]/g, "_");
  const body = Uint8Array.from(decodeCasePdf(aopc.pdfData)).buffer as ArrayBuffer;
  return new Response(body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

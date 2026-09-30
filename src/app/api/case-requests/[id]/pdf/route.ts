import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { decodeCasePdf } from "@/lib/filing-upload";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.providerUserId || !hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const request = await prisma.caseActionRequest.findUnique({ where: { id }, select: { status: true, kind: true, proposedData: true } });
  if (!request || request.status !== "PENDING" || request.kind !== "CREATE") return new Response("Not found", { status: 404 });
  let filing: { pdfData?: string; pdfFileName?: string } | null = null;
  try {
    filing = JSON.parse(request.proposedData).initialFiling ?? null;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!filing?.pdfData) return new Response("Not found", { status: 404 });
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

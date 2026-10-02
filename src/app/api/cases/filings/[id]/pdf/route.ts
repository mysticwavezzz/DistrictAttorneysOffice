import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser, canAccessCase } from "@/lib/case-access";
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
    select: { pdfData: true, pdfFileName: true, case: { select: { id: true, assignedAttorneyId: true, createdById: true, isDraft: true } } },
  });
  if (!filing || !filing.pdfData || !canAccessCase(session.user.tiers, user.id, filing.case, user.division)) {
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

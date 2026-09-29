import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const canReview = Boolean(session?.user && hasCapability(session.user.tiers, CAPABILITIES.AOPC_REVIEW));
  const canSubmit = Boolean(session?.user && hasCapability(session.user.tiers, CAPABILITIES.AOPC_SUBMIT));
  if (!session?.user?.discordUserId || (!canReview && !canSubmit)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const affidavit = await prisma.aopc.findUnique({ where: { id }, select: { submittedById: true, pdfData: true, pdfFileName: true } });
  if (!affidavit?.pdfData || !affidavit.pdfFileName) return NextResponse.json({ error: "PDF not found" }, { status: 404 });

  if (!canReview) {
    const user = await localUser(session.user.discordUserId);
    if (!user || user.id !== affidavit.submittedById) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bytes = Buffer.from(affidavit.pdfData, "base64");
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return NextResponse.json({ error: "Invalid stored PDF" }, { status: 500 });
  const filename = affidavit.pdfFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

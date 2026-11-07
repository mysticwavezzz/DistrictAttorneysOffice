import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptTipAttachment } from "@/lib/crime-tip-encryption";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.TIPS_REVIEW)) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const attachment = await prisma.crimeTipAttachment.findUnique({ where: { id }, select: { fileName: true, mimeType: true, encryptedData: true, sha256: true } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });
  try {
    const bytes = decryptTipAttachment(attachment.encryptedData);
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": attachment.mimeType, "Content-Length": String(bytes.byteLength), "Content-Disposition": `attachment; filename="${attachment.fileName.replace(/[\r\n"\\]/g, "_")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-File-SHA256": attachment.sha256 } });
  } catch {
    return new NextResponse("The attachment could not be decrypted.", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

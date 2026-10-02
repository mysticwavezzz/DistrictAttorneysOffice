import { prisma } from "@/lib/prisma";
import { decodeCasePdf } from "@/lib/filing-upload";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const release = await prisma.announcement.findFirst({
    where: { id, audience: "PUBLIC", isPublished: true, publishedAt: { lte: new Date() } },
    select: { pdfData: true, pdfFileName: true },
  });
  if (!release?.pdfData) return new Response("Not found", { status: 404 });

  const safeName = (release.pdfFileName || "press-release.pdf").replace(/[\r\n"\\/]/g, "_");
  const download = new URL(request.url).searchParams.get("download") === "1";
  const pdf = Uint8Array.from(decodeCasePdf(release.pdfData)).buffer as ArrayBuffer;
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'",
      "Accept-Ranges": "bytes",
    },
  });
}

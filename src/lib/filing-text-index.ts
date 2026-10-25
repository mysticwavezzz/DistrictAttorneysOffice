import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decodeCasePdf } from "@/lib/filing-upload";
import { extractFilingPdfText } from "@/lib/ai-filing-review/pdf-text";

/** Extract selectable PDF text locally for staff search. Never sends content to an AI provider. */
export async function indexAcceptedCaseFiling(filingId: string) {
  const filing = await prisma.caseFiling.findUnique({
    where: { id: filingId },
    select: { id: true, status: true, pdfData: true, textIndex: { select: { sha256: true } } },
  });
  if (!filing || filing.status !== "ACCEPTED" || !filing.pdfData) return false;
  const bytes = decodeCasePdf(filing.pdfData);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (filing.textIndex?.sha256 === sha256) return false;
  const extraction = await extractFilingPdfText(bytes);
  const pages = extraction.pages.map(({ page, text }) => ({ page, text: text.slice(0, 30_000) }));
  const searchText = pages.map(({ page, text }) => `Page ${page}: ${text}`).join("\n").slice(0, 500_000);
  await prisma.caseFilingTextIndex.upsert({
    where: { filingId },
    create: { filingId, sha256, pagesJson: JSON.stringify(pages), searchText, characters: searchText.length },
    update: { sha256, pagesJson: JSON.stringify(pages), searchText, characters: searchText.length, indexedAt: new Date() },
  });
  return true;
}

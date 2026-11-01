import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export const MAX_INDEXED_PDF_PAGES = 80;
export const MAX_INDEXED_TEXT_CHARACTERS = 14_000;

export type ExtractedPdfPage = { page: number; text: string };
export type PdfTextExtraction = { pages: ExtractedPdfPage[]; totalCharacters: number };

export class PdfTextExtractionError extends Error {
  constructor(readonly code: "PDF_UNREADABLE" | "PDF_NO_TEXT" | "PDF_TOO_MANY_PAGES" | "PDF_TEXT_TOO_LONG") {
    super(code);
    this.name = "PdfTextExtractionError";
  }
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextExtraction> {
  let document: Awaited<ReturnType<typeof getDocument>["promise"]> | undefined;
  try {
    document = await getDocument({ data: bytes }).promise;
    if (document.numPages > MAX_INDEXED_PDF_PAGES) throw new PdfTextExtractionError("PDF_TOO_MANY_PAGES");

    const pages: ExtractedPdfPage[] = [];
    let totalCharacters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .flatMap((item) => "str" in item && item.str.trim() ? [item.str.trim()] : [])
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      totalCharacters += text.length;
      pages.push({ page: pageNumber, text });
    }

    if (totalCharacters < 20) throw new PdfTextExtractionError("PDF_NO_TEXT");
    if (totalCharacters > MAX_INDEXED_TEXT_CHARACTERS) throw new PdfTextExtractionError("PDF_TEXT_TOO_LONG");
    return { pages, totalCharacters };
  } catch (error) {
    if (error instanceof PdfTextExtractionError) throw error;
    throw new PdfTextExtractionError("PDF_UNREADABLE");
  } finally {
    await document?.destroy().catch(() => undefined);
  }
}

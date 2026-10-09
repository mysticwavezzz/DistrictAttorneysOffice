import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { extractFilingPdfText, FilingPdfTextError } from "./pdf-text";

async function makePdf(withText: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  if (withText) {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("Complaint caption and requested relief", { x: 48, y: 720, font });
  }
  return pdf.save();
}

describe("filing PDF text extraction", () => {
  it("extracts page-scoped text for evidence verification", async () => {
    const extracted = await extractFilingPdfText(await makePdf(true));
    expect(extracted.pages).toHaveLength(1);
    expect(extracted.pages[0]?.text).toContain("Complaint caption and requested relief");
    expect(extracted.totalCharacters).toBeGreaterThan(20);
  });

  it("stops safely on a scanned or textless PDF instead of guessing", async () => {
    await expect(extractFilingPdfText(await makePdf(false))).rejects.toMatchObject({
      name: "FilingPdfTextError",
      code: "PDF_NO_TEXT",
    } satisfies Partial<FilingPdfTextError>);
  });
});

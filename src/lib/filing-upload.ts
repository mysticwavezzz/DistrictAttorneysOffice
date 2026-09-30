export const MAX_CASE_PDF_BYTES = 5 * 1024 * 1024;

export type StoredCasePdf = { pdfData: string; pdfFileName: string };

export async function readCasePdf(value: FormDataEntryValue | null): Promise<StoredCasePdf | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  if (value.size > MAX_CASE_PDF_BYTES) throw new Error("PDF files must be 5 MB or smaller.");

  const bytes = new Uint8Array(await value.arrayBuffer());
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") throw new Error("Uploaded documents must be valid PDF files.");

  const rawName = "name" in value && typeof value.name === "string" ? value.name : "document.pdf";
  const pdfFileName = rawName.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "document.pdf";
  return { pdfData: Buffer.from(bytes).toString("base64"), pdfFileName };
}

export function decodeCasePdf(pdfData: string): Uint8Array {
  return new Uint8Array(Buffer.from(pdfData, "base64"));
}

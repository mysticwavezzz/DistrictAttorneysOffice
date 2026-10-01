import { MAX_CASE_PDF_BYTES } from "@/lib/filing-limits";

export { MAX_CASE_PDF_BYTES } from "@/lib/filing-limits";

export type StoredCasePdf = { pdfData: string; pdfFileName: string };

export function validateCasePdf(bytes: Uint8Array): string | null {
  if (bytes.byteLength > MAX_CASE_PDF_BYTES) return "PDF files must be 5 MB or smaller.";
  if (bytes.byteLength < 16 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return "This file does not have a valid PDF header.";
  const tail = new TextDecoder("latin1").decode(bytes.slice(Math.max(0, bytes.byteLength - 8192)));
  if (/\/Encrypt\b/.test(tail)) return "Password-protected PDFs are not accepted. Remove the password and upload the PDF again.";
  if (!/%%EOF\s*$/.test(tail)) return "This PDF appears incomplete or unreadable. Re-export it and try again.";
  return null;
}

export async function readCasePdf(value: FormDataEntryValue | null): Promise<StoredCasePdf | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  const bytes = new Uint8Array(await value.arrayBuffer());
  const validationError = validateCasePdf(bytes);
  if (validationError) throw new Error(validationError);

  const rawName = "name" in value && typeof value.name === "string" ? value.name : "document.pdf";
  const pdfFileName = rawName.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "document.pdf";
  return { pdfData: Buffer.from(bytes).toString("base64"), pdfFileName };
}

export function decodeCasePdf(pdfData: string): Uint8Array {
  return new Uint8Array(Buffer.from(pdfData, "base64"));
}

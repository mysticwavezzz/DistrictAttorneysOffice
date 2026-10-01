import { describe, expect, it } from "vitest";
import { MAX_CASE_PDF_BYTES, validateCasePdf } from "./filing-upload";

const validPdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

describe("case PDF validation", () => {
  it("accepts a structurally complete PDF", () => expect(validateCasePdf(validPdf)).toBeNull());
  it("rejects files without a PDF header", () => expect(validateCasePdf(new TextEncoder().encode("hello world this is not a pdf"))).toContain("valid PDF header"));
  it("rejects incomplete documents", () => expect(validateCasePdf(new TextEncoder().encode("%PDF-1.7\nnot finished"))).toContain("incomplete or unreadable"));
  it("rejects encrypted documents", () => expect(validateCasePdf(new TextEncoder().encode("%PDF-1.7\n/Encrypt 1 0 R\n%%EOF"))).toContain("Password-protected"));
  it("rejects oversized documents", () => expect(validateCasePdf(new Uint8Array(MAX_CASE_PDF_BYTES + 1))).toContain("5 MB"));
});

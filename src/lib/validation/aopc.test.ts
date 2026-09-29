import { describe, expect, it } from "vitest";
import { aopcInputSchema } from "./aopc";

describe("AOPC submission input", () => {
  it("accepts a report ID, destination, and HTTPS document link", () => {
    expect(aopcInputSchema.safeParse({ reportId: "HC-2026-123", targetUnit: "Criminal Division", documentUrl: "https://example.com/aopc.pdf" }).success).toBe(true);
  });

  it("allows the document field to be empty for a PDF upload", () => {
    expect(aopcInputSchema.safeParse({ reportId: "HC-2026-123", targetUnit: "Criminal Division", documentUrl: "" }).success).toBe(true);
  });

  it("rejects non-web schemes and missing titles", () => {
    expect(aopcInputSchema.safeParse({ reportId: "HC-2026-123", targetUnit: "Criminal Division", documentUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(aopcInputSchema.safeParse({ targetUnit: "Criminal Division", documentUrl: "https://example.com/aopc.pdf" }).success).toBe(false);
    expect(aopcInputSchema.safeParse({ reportId: "", targetUnit: "Criminal Division", documentUrl: "https://example.com/aopc.pdf" }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { announcementInputSchema } from "./announcement";

const base = { title: "Release", summary: "Short summary", body: "Text body", audience: "PUBLIC", publishedAt: "" };

describe("press release input", () => {
  it("accepts a PDF-backed release with a summary and no text body", () => {
    expect(announcementInputSchema.safeParse({ ...base, body: "" }).success).toBe(true);
  });

  it("validates title, audience, and text limits independently of PDF validation", () => {
    expect(announcementInputSchema.safeParse({ ...base, title: "" }).success).toBe(false);
    expect(announcementInputSchema.safeParse({ ...base, audience: "PRIVATE" }).success).toBe(false);
    expect(announcementInputSchema.safeParse({ ...base, body: "x".repeat(8001) }).success).toBe(false);
  });
});

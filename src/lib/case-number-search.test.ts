import { describe, expect, it } from "vitest";
import { normalizeExactCaseNumber } from "./case-number-search";

describe("exact DA case-number lookup", () => {
  it("normalizes a complete case number", () => {
    expect(normalizeExactCaseNumber(" da-2026-0001 ")).toBe("DA-2026-0001");
  });

  it("does not treat partial or unrelated search text as an exact lookup", () => {
    expect(normalizeExactCaseNumber("DA-2026")).toBeNull();
    expect(normalizeExactCaseNumber("People v. Example")).toBeNull();
  });
});

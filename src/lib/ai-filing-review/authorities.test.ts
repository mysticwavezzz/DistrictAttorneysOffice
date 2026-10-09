import { describe, expect, it } from "vitest";
import { findFilingReviewAuthority, FILING_REVIEW_AUTHORITIES, FILING_REVIEW_SOURCE_VERSION } from "./authorities";

describe("AI filing review authorities", () => {
  it("resolves citations only from the curated source bundle", () => {
    expect(findFilingReviewAuthority("CIV_8_A")?.citation).toBe("Har. R. Civ. P. Rule 8(a)");
    expect(findFilingReviewAuthority("invented-rule")).toBeNull();
  });

  it("has a stable content-derived version for the current bundle", () => {
    expect(FILING_REVIEW_SOURCE_VERSION).toMatch(/^[a-f0-9]{16}$/);
    expect(new Set(FILING_REVIEW_AUTHORITIES.map((authority) => authority.id)).size).toBe(FILING_REVIEW_AUTHORITIES.length);
  });
});

import { describe, it, expect } from "vitest";
import { isCaseStatus, formatCaseStatus, CASE_STATUSES } from "./case-status";

describe("isCaseStatus", () => {
  it("accepts every known status", () => {
    for (const status of CASE_STATUSES) {
      expect(isCaseStatus(status)).toBe(true);
    }
  });

  it("rejects an arbitrary string, including one from another enum-like set", () => {
    expect(isCaseStatus("ARCHIVED")).toBe(false);
    expect(isCaseStatus("")).toBe(false);
  });
});

describe("formatCaseStatus", () => {
  it("replaces underscores with spaces", () => {
    expect(formatCaseStatus("UNDER_REVIEW")).toBe("UNDER REVIEW");
    expect(formatCaseStatus("CHARGES_FILED")).toBe("CHARGES FILED");
  });

  it("leaves a single-word status unchanged", () => {
    expect(formatCaseStatus("OPEN")).toBe("OPEN");
  });
});

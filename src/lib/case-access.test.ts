import { describe, expect, it } from "vitest";
import { canAccessCase } from "./case-access";

describe("case record access boundaries", () => {
  const record = { assignedAttorneyId: "assigned-user", createdById: "creator-user" };
  it("allows the assigned attorney and creator to access their case", () => {
    expect(canAccessCase(["da_attorney"], "assigned-user", record)).toBe(true);
    expect(canAccessCase(["da_attorney"], "creator-user", record)).toBe(true);
  });
  it("does not allow an unrelated attorney to access a case", () => {
    expect(canAccessCase(["special_investigations"], "other-user", record)).toBe(false);
  });
  it("allows view-all staff but keeps drafts private to the creator or view-all staff", () => {
    expect(canAccessCase(["supervising_ada"], "other-user", record)).toBe(true);
    expect(canAccessCase(["special_investigations"], "other-user", { ...record, isDraft: true })).toBe(false);
    expect(canAccessCase(["supervising_ada"], "other-user", { ...record, isDraft: true })).toBe(true);
  });
});

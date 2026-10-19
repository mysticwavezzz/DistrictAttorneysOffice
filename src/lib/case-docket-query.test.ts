import { describe, expect, it } from "vitest";
import { caseDocketWhere } from "./case-docket-query";
import type { PermissionTier } from "@/lib/permissions/tiers";

const base = {
  tiers: ["senior_assistant_district_attorney"] as PermissionTier[],
  viewerId: "reviewer",
  viewerDivision: "Criminal Division",
  viewerGroup: "1",
  ownerId: "attorney",
  tab: "ongoing" as const,
  q: "",
  status: "",
  reviewOnly: false,
};

describe("My Cases docket scope", () => {
  it("keeps the reviewer division and group when a broad title search is added", () => {
    const where = caseDocketWhere({ ...base, q: "People" });
    expect(where).toEqual({ AND: [
      { AND: [{ division: "Criminal Division" }, { divisionGroup: "1" }, {}] },
      { OR: [{ assignedAttorneyId: "attorney" }, { createdById: "attorney" }] },
      { archived: false },
      { OR: [{ title: { contains: "People" } }, { caseNumber: { contains: "People" } }, { assignedAttorney: { displayName: { contains: "People" } } }] },
    ] });
  });

  it("searches an exact case number across the active and archived tabs without dropping access scope", () => {
    const where = caseDocketWhere({ ...base, q: "DA-2026-0001" });
    const conditions = Array.isArray(where?.AND) ? where.AND : [];
    expect(conditions).toContainEqual({ caseNumber: "DA-2026-0001" });
    expect(conditions).not.toContainEqual({ archived: false });
  });

  it("includes both pending changes and pending filings in the review shortcut", () => {
    const where = caseDocketWhere({ ...base, reviewOnly: true });
    const conditions = Array.isArray(where?.AND) ? where.AND : [];
    expect(conditions).toContainEqual({ OR: [
      { actionRequests: { some: { status: "PENDING" } } },
      { filings: { some: { status: "PENDING" } } },
    ] });
  });

  it("shows all accessible cases without an owner filter but retains division and group visibility", () => {
    const where = caseDocketWhere({ ...base, ownerId: null });
    expect(where).toEqual({ AND: [
      { AND: [{ division: "Criminal Division" }, { divisionGroup: "1" }, {}] },
      { archived: false },
    ] });
  });

  it("shows the complete docket for a sitewide case viewer", () => {
    const where = caseDocketWhere({ ...base, tiers: ["district_attorney"], ownerId: null });
    expect(where).toEqual({ AND: [{}, { archived: false }] });
  });
});

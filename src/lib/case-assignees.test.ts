import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rosterEntry: { findMany: mocks.findMany },
    user: { findUnique: mocks.findUnique, create: mocks.create, update: mocks.update },
  },
}));

import { getDivisionCaseAssignees, isAssignableAttorneyRank } from "@/lib/case-assignees";

describe("isAssignableAttorneyRank", () => {
  it.each([
    "Assistant District Attorney",
    "Supervisory Assistant District Attorney",
    "Chief Assistant District Attorney",
    "Deputy District Attorney",
    "District Attorney",
  ])("allows attorney rank %s", (rank) => {
    expect(isAssignableAttorneyRank(rank)).toBe(true);
  });

  it.each(["Paralegal", "Secretary", "Prosecutor in Training", "Chief of Staff", null, undefined])(
    "does not allow non-attorney rank %s",
    (rank) => {
      expect(isAssignableAttorneyRank(rank)).toBe(false);
    },
  );
});

describe("getDivisionCaseAssignees", () => {
  beforeEach(() => vi.clearAllMocks());

  it("materializes permissionless users for active division attorneys and excludes non-attorneys", async () => {
    mocks.findMany.mockResolvedValue([
      { name: "Existing Attorney", rank: "Assistant District Attorney", robloxUserId: "101", discordUserId: null, unit: "Civil Division", divisionGroup: null },
      { name: "New Attorney", rank: "Supervisory Assistant District Attorney", robloxUserId: "102", discordUserId: "discord-102", unit: "Civil Division", divisionGroup: null },
      { name: "Paralegal", rank: "Paralegal", robloxUserId: "103", discordUserId: null, unit: "Civil Division", divisionGroup: null },
    ]);
    mocks.findUnique.mockResolvedValueOnce({ id: "user-101", robloxUserId: "101", discordUserId: null, displayName: "Existing Attorney" }).mockResolvedValueOnce(null);
    mocks.update.mockResolvedValue({ id: "user-101", displayName: "Existing Attorney" });
    mocks.create.mockResolvedValue({ id: "user-102", displayName: "New Attorney" });

    const result = await getDivisionCaseAssignees("Civil Division");

    expect(result).toEqual([
      { id: "user-101", displayName: "Existing Attorney" },
      { id: "user-102", displayName: "New Attorney" },
    ]);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ unit: "Civil Division", isActive: true }) }));
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ robloxUserId: "102", discordUserId: "discord-102", tiers: "", division: "Civil Division" }) });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("limits group-scoped roster results to the viewer's Criminal Division group", async () => {
    mocks.findMany.mockResolvedValue([]);

    await getDivisionCaseAssignees("Criminal Division", { divisionGroup: "2", restrictToGroup: true });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ unit: "Criminal Division", divisionGroup: "2" }) }));
  });
});

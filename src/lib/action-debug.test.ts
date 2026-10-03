import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { actionDebugLog: { create: mocks.create, deleteMany: mocks.deleteMany } } }));

import { runWithActionDebug } from "./action-debug";

describe("runWithActionDebug", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValueOnce("00000000-0000-4000-8000-000000000001").mockReturnValueOnce("00000000-0000-4000-8000-000000000002") });
    mocks.auth.mockResolvedValue({ user: { providerUserId: "roblox-42", username: "OfficerExample", identityProvider: "roblox", tiers: ["law_enforcement"] } });
    mocks.create.mockResolvedValue(undefined);
    mocks.deleteMany.mockResolvedValue({ count: 0 });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("assigns a unique serial ID and stores actor, outcome, and only a safe target reference", async () => {
    const sensitiveForm = new FormData();
    sensitiveForm.set("caseId", "case_123");
    sensitiveForm.set("narrative", "private report text");
    const result = await runWithActionDebug("editCase", [sensitiveForm], async () => "saved");
    await runWithActionDebug("editCase", [], async () => "saved");

    expect(result).toBe("saved");
    const first = mocks.create.mock.calls[0]![0].data;
    const second = mocks.create.mock.calls[1]![0].data;
    expect(first.actionId).toMatch(/^ACT-\d{8}-[0-9A-F-]{36}$/);
    expect(first.actionId).not.toBe(second.actionId);
    expect(first.actorName).toBe("OfficerExample");
    expect(first.permissionTiers).toBe('["law_enforcement"]');
    expect(first.outcome).toBe("SUCCESS");
    expect(first.targetReference).toBe("caseId:case_123");
    expect(JSON.stringify(first)).not.toContain("private report text");
  });

  it("records failed HTTP responses and preserves server action exceptions", async () => {
    await runWithActionDebug("saveRecord", [], async () => new Response(null, { status: 422 }));
    expect(mocks.create.mock.calls[0]![0].data).toMatchObject({ outcome: "FAILED", errorName: "HTTP_422" });

    await expect(runWithActionDebug("saveRecord", [], async () => { throw new TypeError("request contains private data"); })).rejects.toThrow("request contains private data");
    expect(mocks.create.mock.calls[1]![0].data).toMatchObject({ outcome: "FAILED", errorName: "TypeError" });
    expect(mocks.create.mock.calls[1]![0].data.errorStack).not.toContain("request contains private data");
  });
});

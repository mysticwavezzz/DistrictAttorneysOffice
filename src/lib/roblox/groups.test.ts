import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRobloxGroupMembers } from "./groups";

afterEach(() => vi.unstubAllGlobals());

describe("fetchRobloxGroupMembers", () => {
  it("collects every page into one complete membership snapshot", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ user: { userId: 123, username: "First", displayName: "First Display" }, role: { id: 100910625, name: "Assistant District Attorney", rank: 20 } }],
        nextPageCursor: "page-2",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ user: { userId: 456, username: "Second" }, role: { id: 100910597, name: "Deputy District Attorney", rank: 30 } }],
        nextPageCursor: null,
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const members = await fetchRobloxGroupMembers(32985413);

    expect(members.map(({ userId }) => userId)).toEqual(["123", "456"]);
    expect(members[0]?.displayName).toBe("First Display");
    expect(members[1]?.displayName).toBe("Second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("cursor=page-2");
  });

  it("fails instead of returning a partial snapshot when Roblox rejects a page", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], nextPageCursor: "next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRobloxGroupMembers(32985413)).rejects.toThrow("returned 503 on page 2");
  });

  it("rejects repeated cursors rather than risking an incomplete snapshot", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response(JSON.stringify({ data: [], nextPageCursor: "repeat" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRobloxGroupMembers(32985413)).rejects.toThrow("repeated group pagination cursor");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { siteConfiguration: { findUnique } },
}));

import { getSiteConfiguration } from "./site-settings";

describe("site configuration compatibility", () => {
  beforeEach(() => findUnique.mockReset());

  it("reads a legacy raw website version string", async () => {
    findUnique.mockResolvedValue({ value: "1.1.1" });
    await expect(getSiteConfiguration("websiteVersion", "")).resolves.toBe("1.1.1");
  });

  it("reads JSON-encoded settings normally", async () => {
    findUnique.mockResolvedValue({ value: JSON.stringify("2.0.0") });
    await expect(getSiteConfiguration("websiteVersion", "")).resolves.toBe("2.0.0");
  });

  it("uses the supplied fallback for malformed non-version configuration", async () => {
    findUnique.mockResolvedValue({ value: "not-json" });
    await expect(getSiteConfiguration("tierCapabilities", {})).resolves.toEqual({});
  });
});

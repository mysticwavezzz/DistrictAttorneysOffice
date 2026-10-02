import { describe, expect, it } from "vitest";
import { resolveWebsiteVersion } from "./site-version";

describe("website version display", () => {
  it("uses the package release when there is no manual override", () => {
    expect(resolveWebsiteVersion("1.1.5", "")).toBe("1.1.5");
  });

  it("migrates the old auto-pinned version to the package version", () => {
    expect(resolveWebsiteVersion("1.1.5", "1.1.1")).toBe("1.1.5");
  });

  it("preserves an intentional manual version override", () => {
    expect(resolveWebsiteVersion("1.1.5", "2.0.0")).toBe("2.0.0");
  });
});

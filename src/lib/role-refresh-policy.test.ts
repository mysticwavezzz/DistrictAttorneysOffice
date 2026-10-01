import { describe, expect, it } from "vitest";
import { MAX_ROLE_STALENESS_MS, mayUseCachedRoles } from "./role-refresh-policy";

describe("role refresh outage policy", () => {
  it("keeps the last successful role result briefly during a provider outage", () => {
    expect(mayUseCachedRoles(10_000, 10_000 + MAX_ROLE_STALENESS_MS)).toBe(true);
  });
  it("fails closed when role data is missing, expired, or from the future", () => {
    expect(mayUseCachedRoles(undefined, 10_000)).toBe(false);
    expect(mayUseCachedRoles(10_000, 10_001 + MAX_ROLE_STALENESS_MS)).toBe(false);
    expect(mayUseCachedRoles(10_001, 10_000)).toBe(false);
  });
});

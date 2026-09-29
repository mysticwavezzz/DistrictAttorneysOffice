import { describe, it, expect } from "vitest";
import { findRouteRule } from "./route-permissions";
import { CAPABILITIES } from "@/lib/permissions/capabilities";

describe("findRouteRule", () => {
  it("returns null for public routes", () => {
    expect(findRouteRule("/")).toBeNull();
    expect(findRouteRule("/login")).toBeNull();
  });

  it("matches the dashboard overview to dashboard:view", () => {
    const rule = findRouteRule("/dashboard");
    expect(rule?.capabilities).toEqual([CAPABILITIES.DASHBOARD_VIEW]);
  });

  it("matches nested dashboard routes by prefix", () => {
    const rule = findRouteRule("/dashboard/settings");
    expect(rule?.capabilities).toEqual([CAPABILITIES.DASHBOARD_VIEW]);
  });

  it("prefers the more specific /dashboard/cases rule over the /dashboard rule", () => {
    const rule = findRouteRule("/dashboard/cases");
    expect(rule?.capabilities).toEqual([CAPABILITIES.CASES_VIEW]);
  });

  it("applies the specific rule to nested case routes too", () => {
    const rule = findRouteRule("/dashboard/cases/abc123");
    expect(rule?.capabilities).toEqual([CAPABILITIES.CASES_VIEW]);
  });

  it("does not treat an unrelated path with a matching prefix substring as protected", () => {
    expect(findRouteRule("/dashboard-public")).toBeNull();
  });

  it("gates the public-site bulletin route to bulletin:view, separate from the dashboard", () => {
    const rule = findRouteRule("/bulletin");
    expect(rule?.capabilities).toEqual([CAPABILITIES.BULLETIN_VIEW]);
  });
});

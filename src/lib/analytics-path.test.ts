import { describe, expect, it } from "vitest";
import { trackedPublicPath } from "./analytics-path";

describe("trackedPublicPath", () => {
  it("keeps only the exact allowlisted public paths", () => {
    for (const path of ["/", "/privacy-policy", "/terms-of-service", "/report-crime", "/records-request"]) {
      expect(trackedPublicPath(path)).toBe(path);
    }
  });

  it("excludes staff pages, APIs, announcement identifiers, query strings, and unknown paths", () => {
    for (const path of ["/dashboard", "/98981/analytics", "/api/analytics/pageview", "/announcements/case-123", "/?secret=x", "/not-a-page"]) {
      expect(trackedPublicPath(path)).toBeNull();
    }
  });
});

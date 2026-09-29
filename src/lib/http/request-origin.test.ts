import { describe, expect, it } from "vitest";
import { isAllowedRequestOrigin } from "./request-origin";

describe("isAllowedRequestOrigin", () => {
  it("allows the public Railway origin behind an internal reverse-proxy URL", () => {
    expect(isAllowedRequestOrigin({
      origin: "https://districtattorneysoffice-production.up.railway.app",
      requestUrl: "http://127.0.0.1:3000/api/tips",
      forwardedHost: "districtattorneysoffice-production.up.railway.app",
      forwardedProto: "https",
      host: "127.0.0.1:3000",
    })).toBe(true);
  });

  it("allows the explicitly configured site origin", () => {
    expect(isAllowedRequestOrigin({
      origin: "https://da.example",
      requestUrl: "http://internal/api/tips",
      host: "internal",
      configuredSiteUrl: "https://da.example/",
    })).toBe(true);
  });

  it("rejects unrelated hosts and protocol downgrades", () => {
    const base = { requestUrl: "https://da.example/api/tips", host: "da.example", forwardedProto: "https" };
    expect(isAllowedRequestOrigin({ ...base, origin: "https://evil.example" })).toBe(false);
    expect(isAllowedRequestOrigin({ ...base, origin: "http://da.example" })).toBe(false);
  });

  it("allows requests with no Origin header for non-browser clients", () => {
    expect(isAllowedRequestOrigin({ origin: null, requestUrl: "http://localhost/api/tips" })).toBe(true);
  });
});

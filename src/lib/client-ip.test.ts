import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "./client-ip";

describe("client IP extraction", () => {
  it("prefers a valid reverse-proxy real IP", () => expect(clientIpFromHeaders(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.4" }))).toBe("203.0.113.7"));
  it("uses the first valid forwarded client address", () => expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }))).toBe("198.51.100.4"));
  it("does not use invalid or arbitrary header values as rate-limit keys", () => expect(clientIpFromHeaders(new Headers({ "x-real-ip": "garbage", "x-forwarded-for": "unknown" }))).toBe("unknown"));
});

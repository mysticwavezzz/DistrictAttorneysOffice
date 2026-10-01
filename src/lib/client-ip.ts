import { isIP } from "node:net";

/** Prefer proxy-supplied real IP; otherwise use the left-most forwarded client value. */
export function clientIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor && isIP(forwardedFor)) return forwardedFor;
  return "unknown";
}

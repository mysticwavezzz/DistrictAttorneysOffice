// Content-Security-Policy is set per-request in middleware.ts instead of
// here, because a secure script-src needs a fresh nonce on every request
// (see middleware.ts for why) — that can't be expressed as a static
// header. Everything else that doesn't vary per-request lives here.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "tr.rbxcdn.com" },
      { protocol: "https", hostname: "t0.rbxcdn.com" },
      { protocol: "https", hostname: "t1.rbxcdn.com" },
      { protocol: "https", hostname: "t2.rbxcdn.com" },
      { protocol: "https", hostname: "t3.rbxcdn.com" },
      { protocol: "https", hostname: "t4.rbxcdn.com" },
      { protocol: "https", hostname: "t5.rbxcdn.com" },
      { protocol: "https", hostname: "t6.rbxcdn.com" },
      { protocol: "https", hostname: "t7.rbxcdn.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

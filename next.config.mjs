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

// Node-only packages pulled in by the Discord bot (src/bot/dao-bot.ts). They
// depend on Node built-ins (worker_threads, zlib, timers, ...) and optional
// native addons, so webpack must never try to bundle them.
const discordNodeOnlyPackages = [
  "discord.js",
  "@discordjs/ws",
  "undici",
  "zlib-sync",
  "bufferutil",
  "utf-8-validate",
];

const isDiscordNodeOnlyRequest = (request) =>
  typeof request === "string"
  && discordNodeOnlyPackages.some((name) => request === name || request.startsWith(`${name}/`));

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: [
    "web-push",
    "pdfjs-dist",
    "discord.js",
    "@discordjs/ws",
    "zlib-sync",
    "bufferutil",
    "utf-8-validate",
  ],
  experimental: {
    serverActions: { bodySizeLimit: "7mb" },
  },
  webpack(config, { isServer, nextRuntime }) {
    if (isServer && nextRuntime !== "edge") {
      // Node server compile: load these at runtime with require() instead of bundling.
      const externals = Array.isArray(config.externals)
        ? config.externals
        : config.externals ? [config.externals] : [];
      config.externals = [
        ...externals,
        ({ request }, callback) => {
          if (isDiscordNodeOnlyRequest(request)) return callback(null, `commonjs ${request}`);
          return callback();
        },
      ];
    } else if (isServer) {
      // instrumentation.ts is also compiled for the edge runtime, where webpack
      // resolves the dynamic import before dead-code elimination removes the
      // NEXT_RUNTIME guard. The bot never runs on edge, so resolve it to an empty module.
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        ...Object.fromEntries(discordNodeOnlyPackages.map((name) => [name, false])),
      };
    }
    return config;
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
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

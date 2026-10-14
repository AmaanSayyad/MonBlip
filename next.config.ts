import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@dynamic-labs-wallet/node-evm',
    '@dynamic-labs-wallet/node',
    '@dynamic-labs-wallet/core',
    '@privy-io/node',
  ],
  // The repo sits inside another folder that has its own lockfile. Pin the
  // root here so Next stops warning and watching the parent directory.
  turbopack: {
    root: import.meta.dirname,
  },
  /* Smaller dev cold compiles: tree-shake heavy barrel-export packages */
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "recharts",
      "@tanstack/react-query",
    ],
  },
  typescript: {
    // Ignore TypeScript errors in near-docs folder during build
    ignoreBuildErrors: false,
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      // Keep script policy compatible with Next/Turbopack runtime and in-app tooling.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://*.posthog.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https: wss:",
      // Allow only known embed providers used by the app.
      "frame-src https://www.youtube.com https://youtube.com https://docs.google.com https://dexscreener.com",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // COOP same-origin breaks Coinbase Smart Wallet and other popup-based wallets (opener communication).
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

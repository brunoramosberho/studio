import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "http://betoro.localhost:3000",
    "http://sandbox-revive.localhost:3000",
    "http://*.localhost:3000",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "unavatar.io",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "framer-motion"],
  },
  async rewrites() {
    return [
      { source: "/apple-touch-icon.png", destination: "/apple-icon" },
      { source: "/apple-touch-icon-precomposed.png", destination: "/apple-icon" },
    ];
  },
  async redirects() {
    return [
      { source: "/coaches", destination: "/instructors", permanent: true },
    ];
  },
  async headers() {
    // Explicitly allow the embed routes to be framed on any host so tenants
    // can paste the widget on their own website (Wix, WordPress, Webflow…).
    // Hosting platforms sometimes default to X-Frame-Options: SAMEORIGIN; we
    // override that here and rely on CSP frame-ancestors instead.
    return [
      {
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

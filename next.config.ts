import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile in the home directory
  // isn't picked up by Turbopack.
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    // proxy.ts makes Next buffer every request body, and past this size it
    // silently hands the route only the first part (default 10 MB). It must
    // stay ABOVE the largest body any route accepts (backup import 25 MB,
    // restore-file 21 MB, documents 21 MB, photos 25 MB) so a real file is
    // never cut. The routes also byte-check their bodies (lib/security.ts
    // readBodyBytes) so anything that does get cut is rejected, not stored.
    proxyClientMaxBodySize: "26mb",
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile in the home directory
  // isn't picked up by Turbopack.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;

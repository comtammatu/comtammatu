import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@comtammatu/shared",
    "@comtammatu/database",
    "@comtammatu/ui",
    "@comtammatu/security",
  ],
  turbopack: {
    root: resolve(import.meta.dirname, "../.."),
  },
};

export default nextConfig;

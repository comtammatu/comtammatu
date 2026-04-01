import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@comtammatu/shared",
    "@comtammatu/database",
    "@comtammatu/ui",
    "@comtammatu/security",
  ],
};

export default nextConfig;

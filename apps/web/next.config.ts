import type { NextConfig } from "next";
import { resolve } from "node:path";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

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
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default withSerwist(nextConfig);

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
  // POS menu thumbs come from the public `menu-images` Supabase Storage
  // bucket. Letting Next's image optimizer route them gives us:
  //   - On-the-fly WebP/AVIF transcode (originals are JPEG/PNG up to 5MB)
  //   - Width-bucketed variants matching the grid cell (~180-260px on tablet,
  //     up to ~400px on 2xl desktop)
  //   - SW StaleWhileRevalidate via the existing `/_next/image` rule in
  //     `app/sw.ts` — repeat shifts hit cache, no Storage round-trip
  // Wildcard hostname covers dev project + future prod project; path scope
  // limited to `/storage/v1/object/public/**` so we never accidentally
  // proxy auth-gated `/object/sign/**` URLs.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
    // Tablet-first device sizes — POS grid cells max ~400px even on a 2xl
    // desktop. Trim default sizes (640..3840) so we don't generate variants
    // we'll never serve.
    deviceSizes: [320, 420, 640, 960],
    imageSizes: [96, 160, 200, 256, 320],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;

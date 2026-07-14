import type { NextConfig } from "next";
import { resolve } from "node:path";

// Pragmatic CSP for Next.js 16 RSC: hydration payload + chunk loader ship as
// inline <script>. Nonce-based CSP needs a middleware refactor; until that
// lands we accept 'unsafe-inline' on script/style. Everything else is tightly
// scoped — Supabase REST/storage/realtime + Upstash + self.
// Dev-only: allow the local Supabase stack (supabase start → 127.0.0.1:54321)
// so the browser can reach REST + realtime against a local DB. Production
// NODE_ENV keeps the original byte-identical policy.
let localSupabase = "";
if (process.env.NODE_ENV !== "production") {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
      const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
      localSupabase = ` ${url.origin} ${wsProtocol}//${url.host}`;
    } catch {
      // Fallback if parsing fails
    }
  }
  // Fallback to default ports if no env URL or parsing failed
  if (!localSupabase) {
    localSupabase =
      " http://127.0.0.1:54321 ws://127.0.0.1:54321 http://127.0.0.1:55521 ws://127.0.0.1:55521 http://127.0.0.1:55421 ws://127.0.0.1:55421";
  }
}
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.supabase.co https://play-lh.googleusercontent.com${localSupabase}`,
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.upstash.io https://api.vietqr.io${localSupabase}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
  // 2 years + includeSubDomains + preload makes app.comtammatu.com eligible
  // for the Chrome/Firefox HSTS preload list — first-visit downgrade attacks
  // are blocked by the browser without ever talking to our origin.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/br/:branchId/dashboard",
        destination: "/br/:branchId",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  transpilePackages: [
    "@comtammatu/shared",
    "@comtammatu/database",
    "@comtammatu/ui",
    "@comtammatu/security",
    "@comtammatu/print-render",
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
    // Per-icon tree-shaking for lucide-react. Without this, importing any icon
    // pulls the full barrel into bundles. radix-ui: packages/ui components
    // import the unified `radix-ui` barrel (~26 components) — same tree-shake
    // treatment avoids pulling every Radix primitive into shared chunks.
    optimizePackageImports: ["lucide-react", "radix-ui"],
  },
};

export default nextConfig;

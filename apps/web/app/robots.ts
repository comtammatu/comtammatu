import type { MetadataRoute } from "next";

// Public surface of comtammatu.com is the marketing site (none yet). Protected,
// API, auth, and operational pages are auth-gated and have no SEO value.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: [
          "/api/",
          "/login",
          "/access-denied",
          "/br/",
          "/notifications",
          "/orders",
          "/menu",
          "/inventory/",
          "/payment/",
        ],
      },
    ],
  };
}

import type { MetadataRoute } from "next";

// Public surface of comtammatu.com is the marketing site (none yet). Admin,
// API, auth, and operational pages are auth-gated and have no SEO value.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: [
          "/admin/",
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

import type { MetadataRoute } from "next";

// Public surface of comtammatu.com is the marketing site (none yet) + the
// QR feedback flow at /r/<token>. Tokens rotate, so any indexed deep link
// goes dead — better to keep crawlers off `/r/` entirely. Admin/API/auth
// pages are auth-gated and have no SEO value.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: [
          "/r/",
          "/admin/",
          "/api/",
          "/login",
          "/access-denied",
          "/employee/",
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

import type { NextRequest } from "next/server";
import { BROWSER_CHROME_THEME_COLORS } from "@/_lib/theme-tokens";
import { buildPwaLauncherIcons } from "@/_lib/pwa-launcher-icons";

const PERSONNEL_MANIFEST_REVALIDATE_SECONDS = 3600;

export function GET(_request: NextRequest) {
  const body = {
    id: "/me",
    name: "Cơm Tấm Má Tư - Trang cá nhân",
    short_name: "Trang cá nhân",
    description: "Trang cá nhân - Cơm Tấm Má Tư",
    lang: "vi",
    display: "standalone",
    start_url: "/me",
    // Overlapping origin scope is the locked isolation model (OQ-3): identity
    // is `id` / `start_url` / name, not a narrower path.
    scope: "/",
    background_color: BROWSER_CHROME_THEME_COLORS.light,
    theme_color: BROWSER_CHROME_THEME_COLORS.light,
    orientation: "portrait",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: buildPwaLauncherIcons("me"),
  };

  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": `public, max-age=${PERSONNEL_MANIFEST_REVALIDATE_SECONDS}`,
    },
  });
}

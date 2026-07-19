import { BROWSER_CHROME_THEME_COLORS } from "@/_lib/theme-tokens";

type OperationalApp = "pos" | "kds" | "runner" | "operator";
type OperationalOrientation = "portrait" | "landscape";

const APP_LABELS: Record<
  OperationalApp,
  { label: string; description: string; orientation: OperationalOrientation }
> = {
  pos: {
    label: "POS",
    description: "Điểm bán hàng - Cơm Tấm Má Tư",
    orientation: "portrait",
  },
  kds: {
    label: "KDS",
    description: "Màn hình bếp - Cơm Tấm Má Tư",
    orientation: "landscape",
  },
  runner: {
    label: "Gọi số",
    description: "Màn gọi số - Cơm Tấm Má Tư",
    orientation: "landscape",
  },
  operator: {
    label: "Cổng vận hành",
    description: "Cổng vận hành - Cơm Tấm Má Tư",
    orientation: "portrait",
  },
};

// The operator app is one installable app per branch runtime. Its identity and
// start URL keep branch scope in the URL. Single-job stations keep their own
// route-specific install identities.
const OPERATOR_APP: OperationalApp = "operator";

const OPERATIONAL_MANIFEST_REVALIDATE_SECONDS = 3600;

function normalizeManifestBranchId(rawBranchId: string): string | null {
  const branchNum = Number.parseInt(rawBranchId, 10);
  // Reject any segment that isn't a clean positive integer string. parseInt
  // accepts "123abc" -> 123, but reflecting the raw segment into start_url /
  // scope would produce a route that doesn't exist.
  if (
    !Number.isFinite(branchNum) ||
    branchNum <= 0 ||
    String(branchNum) !== rawBranchId
  ) {
    return null;
  }
  return String(branchNum);
}

function buildOperationalManifest(app: OperationalApp, branchId: string) {
  const appConfig = APP_LABELS[app];
  const isOperator = app === OPERATOR_APP;
  const rootUrl = `/br/${branchId}`;
  const appUrl = isOperator ? rootUrl : `${rootUrl}/${app}`;

  return {
    id: appUrl,
    name: isOperator
      ? "Cơm Tấm Má Tư - Cổng vận hành"
      : `Cơm Tấm Má Tư - ${appConfig.label} CN${branchId}`,
    short_name: isOperator ? "Cổng Má Tư" : `Má Tư ${appConfig.label}`,
    description: appConfig.description,
    lang: "vi",
    display: "standalone",
    start_url: appUrl,
    // The operator app and all single-job stations scope the entire origin so that
    // navigations between them (including the toolbar return link and
    // auth redirects) do not drop the installed PWA back into a browser tab.
    scope: "/",
    background_color: BROWSER_CHROME_THEME_COLORS.light,
    theme_color: BROWSER_CHROME_THEME_COLORS.light,
    orientation: appConfig.orientation,
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}

export function buildOperationalManifestResponse(
  app: OperationalApp,
  rawBranchId: string,
) {
  const branchId = normalizeManifestBranchId(rawBranchId);
  if (branchId == null) {
    return new Response("Invalid branch id", { status: 400 });
  }

  return new Response(JSON.stringify(buildOperationalManifest(app, branchId)), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": `public, max-age=${OPERATIONAL_MANIFEST_REVALIDATE_SECONDS}`,
    },
  });
}

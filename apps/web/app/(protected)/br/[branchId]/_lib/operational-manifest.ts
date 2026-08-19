import { BROWSER_CHROME_THEME_COLORS } from "@/_lib/theme-tokens";
import {
  buildPwaLauncherIcons,
  type PwaLauncherApp,
} from "@/_lib/pwa-launcher-icons";

type OperationalApp = "pos" | "kds" | "pickup" | "operator";
type OperationalOrientation = "portrait" | "landscape";

const LAUNCHER_ICON_APP: Record<OperationalApp, PwaLauncherApp> = {
  pos: "pos",
  kds: "kds",
  pickup: "pickup",
  operator: "cong",
};

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
  pickup: {
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
    // Overlapping origin scope is the locked isolation model (OQ-3): identity
    // is `id` / `start_url` / name, not a narrower path. Auth redirects and
    // station-to-operator toolbar links must stay inside the installed app.
    scope: "/",
    background_color: BROWSER_CHROME_THEME_COLORS.light,
    theme_color: BROWSER_CHROME_THEME_COLORS.light,
    orientation: appConfig.orientation,
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: buildPwaLauncherIcons(LAUNCHER_ICON_APP[app]),
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

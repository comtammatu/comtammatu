type OperationalApp = "pos" | "kds" | "runner";
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
};

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

  return {
    id: `/br/${branchId}/${app}`,
    name: `Cơm Tấm Má Tư - ${appConfig.label} CN${branchId}`,
    short_name: `Má Tư ${appConfig.label}`,
    description: appConfig.description,
    lang: "vi",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    start_url: `/br/${branchId}/${app}`,
    scope: `/br/${branchId}/${app}`,
    background_color: "#fff6ee",
    theme_color: "#fff6ee",
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

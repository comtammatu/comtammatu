import type { NextRequest } from "next/server";

export const revalidate = 3600;

interface ManifestParams {
  params: Promise<{ branchId: string }>;
}

export async function GET(_request: NextRequest, { params }: ManifestParams) {
  const { branchId: rawBranchId } = await params;
  const branchNum = Number.parseInt(rawBranchId, 10);
  // Reject any segment that isn't a clean positive integer string. parseInt
  // accepts "123abc" → 123, but reflecting the raw segment into start_url /
  // scope would produce a route that doesn't exist.
  if (
    !Number.isFinite(branchNum) ||
    branchNum <= 0 ||
    String(branchNum) !== rawBranchId
  ) {
    return new Response("Invalid branch id", { status: 400 });
  }
  const branchId = String(branchNum);

  const manifest = {
    id: `/br/${branchId}/pos`,
    name: `Cơm Tấm Má Tư — POS CN${branchId}`,
    short_name: `POS CN${branchId}`,
    description: "Điểm bán hàng — Cơm Tấm Má Tư",
    lang: "vi",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    start_url: `/br/${branchId}/pos`,
    scope: `/br/${branchId}/`,
    background_color: "#fafaf8",
    theme_color: "#fafaf8",
    orientation: "any",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/**
 * Catalog hygiene for YCH / YCM / PO fail-closed gates:
 * - YCH needs `default_fulfill_site_kind` (Nguồn hàng)
 * - YCM needs ≥1 active supplier_item on an active supplier
 */

export type CatalogReadinessGap = "missing_fulfill_site" | "missing_supplier_link";

export type CatalogReadinessInput = {
  isActive: boolean;
  defaultFulfillSiteKind: "central_supply" | "central_kitchen" | null | undefined;
  hasActiveSupplierLink: boolean;
};

export type CatalogReadiness = {
  gaps: CatalogReadinessGap[];
  isReady: boolean;
};

export function resolveCatalogReadiness(
  input: CatalogReadinessInput,
): CatalogReadiness {
  if (!input.isActive) {
    return { gaps: [], isReady: true };
  }

  const gaps: CatalogReadinessGap[] = [];
  if (
    input.defaultFulfillSiteKind !== "central_supply" &&
    input.defaultFulfillSiteKind !== "central_kitchen"
  ) {
    gaps.push("missing_fulfill_site");
  }
  if (!input.hasActiveSupplierLink) {
    gaps.push("missing_supplier_link");
  }

  return { gaps, isReady: gaps.length === 0 };
}

export function catalogReadinessHasGap(
  input: CatalogReadinessInput,
  gap: CatalogReadinessGap | "any",
): boolean {
  const { gaps } = resolveCatalogReadiness(input);
  if (gap === "any") return gaps.length > 0;
  return gaps.includes(gap);
}

export function summarizeCatalogReadiness(
  rows: readonly CatalogReadinessInput[],
): {
  activeCount: number;
  gapCount: number;
  missingFulfillSiteCount: number;
  missingSupplierLinkCount: number;
} {
  let activeCount = 0;
  let gapCount = 0;
  let missingFulfillSiteCount = 0;
  let missingSupplierLinkCount = 0;

  for (const row of rows) {
    if (!row.isActive) continue;
    activeCount += 1;
    const { gaps } = resolveCatalogReadiness(row);
    if (gaps.length === 0) continue;
    gapCount += 1;
    if (gaps.includes("missing_fulfill_site")) missingFulfillSiteCount += 1;
    if (gaps.includes("missing_supplier_link")) missingSupplierLinkCount += 1;
  }

  return {
    activeCount,
    gapCount,
    missingFulfillSiteCount,
    missingSupplierLinkCount,
  };
}

/**
 * Catalog hygiene for YCH / YCM / PO fail-closed gates:
 * - Pull DC needs at least one Nguồn hàng tick (Kho Tổng and/or Bếp TT)
 * - YCM/PO needs ≥1 active supplier_item only on purchased kinds
 *   (`raw_material`, and later `packaging` / `supply`). Produced
 *   `finished_good` / `semi_finished` have no NCC gap — kitchen produces
 *   them with a production recipe. Purchased goods stay `raw_material`.
 */

import { hasAllowedFulfillSite, resolveFulfillSiteFlags } from "./fulfill-site";

export type CatalogReadinessGap = "missing_fulfill_site" | "missing_supplier_link";

const PRODUCED_ITEM_KINDS = new Set(["finished_good", "semi_finished"]);

export type CatalogReadinessInput = {
  isActive: boolean;
  defaultFulfillSiteKind: "central_supply" | "central_kitchen" | null | undefined;
  fulfillFromCentralSupply?: boolean | null;
  fulfillFromCentralKitchen?: boolean | null;
  hasActiveSupplierLink: boolean;
  /** When omitted, treat as purchased (fail closed). */
  itemKind?: string | null;
};

export function catalogItemRequiresSupplierLink(
  itemKind: string | null | undefined,
): boolean {
  return !PRODUCED_ITEM_KINDS.has(itemKind ?? "");
}

export function filterPurchasedIngredientRows<T extends { item_kind: string }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => catalogItemRequiresSupplierLink(row.item_kind));
}

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
    !hasAllowedFulfillSite(
      resolveFulfillSiteFlags({
        fulfillFromCentralSupply: input.fulfillFromCentralSupply,
        fulfillFromCentralKitchen: input.fulfillFromCentralKitchen,
        defaultFulfillSiteKind: input.defaultFulfillSiteKind,
      }),
    )
  ) {
    gaps.push("missing_fulfill_site");
  }
  if (
    catalogItemRequiresSupplierLink(input.itemKind) &&
    !input.hasActiveSupplierLink
  ) {
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

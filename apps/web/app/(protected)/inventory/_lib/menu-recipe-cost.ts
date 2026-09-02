import type { IngredientUnitRow } from "@lib/inventory/types";

type RecipeLineBaseQuantityInput = {
  quantity: number;
  entryUnitId: number | null;
  units?: readonly IngredientUnitRow[] | null;
};

/** Catalog “Nguồn hàng” / Kho gốc on ingredients. */
export type MenuRecipeSourceSiteKind = "central_supply" | "central_kitchen";

export type SourceSiteWacRow = {
  ingredientId: number;
  branchKind: string | null | undefined;
  avgUnitCost: number | string | null;
  currentQuantity?: number | string | null;
};

/**
 * Matches `inv_to_base_for_tenant`: null entry unit → qty unchanged; missing
 * active conversion → null (never silent 1). SQL raises
 * `recipe_unit_conversion_missing` on that last case.
 */
export function getMenuRecipeLineBaseQuantity({
  quantity,
  entryUnitId,
  units,
}: RecipeLineBaseQuantityInput): number | null {
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;

  if (entryUnitId == null) {
    return safeQuantity;
  }

  const entryUnit = units?.find(
    (unit) => Number(unit.unit_id) === entryUnitId && unit.is_active,
  );
  const factor = Number(entryUnit?.to_base_factor);

  if (Number.isFinite(factor) && factor > 0) {
    return safeQuantity * factor;
  }

  return null;
}

export function formatMenuRecipeQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return "";
  if (Number.isInteger(quantity)) return String(quantity);
  return String(Number(quantity.toFixed(3)));
}

export function formatMenuRecipeBomSummary(
  items: readonly {
    ingredientName: string;
    qty: number;
    unitLabel: string;
    isPrimary?: boolean;
  }[],
): string {
  return items
    .map((item) => {
      const qty = formatMenuRecipeQuantity(item.qty);
      const unit = item.unitLabel.trim();
      const name = item.ingredientName.trim() + (item.isPrimary ? " (chính)" : "");
      return [name, qty, unit]
        .filter((part) => part.length > 0)
        .join(" ");
    })
    .filter((part) => part.length > 0)
    .join(" · ");
}

/** Catalog food-cost treats 0 / null WAC as “not valued yet”, never as free. */
export function isPositiveUnitCost(
  value: number | null | undefined,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isMenuRecipeSourceSiteKind(
  value: string | null | undefined,
): value is MenuRecipeSourceSiteKind {
  return value === "central_supply" || value === "central_kitchen";
}

export function menuRecipeSourceWacKey(
  siteKind: MenuRecipeSourceSiteKind,
  ingredientId: number,
): string {
  return `${siteKind}:${ingredientId}`;
}

/**
 * Company WAC per ingredient (ADR 0040). Computes quantity-weighted average
 * cost across stock-bearing sites holding positive stock, falling back to
 * unweighted average when site quantities are omitted or zero.
 */
export function buildCompanyWacMap(
  rows: readonly SourceSiteWacRow[],
): Record<number, number> {
  const accum = new Map<
    number,
    {
      weightedValueSum: number;
      positiveQtySum: number;
      costSum: number;
      costCount: number;
    }
  >();

  for (const row of rows) {
    const cost = Number(row.avgUnitCost);
    if (!isPositiveUnitCost(cost)) continue;
    const id = Number(row.ingredientId);
    if (!Number.isFinite(id) || id <= 0) continue;

    const entry = accum.get(id) ?? {
      weightedValueSum: 0,
      positiveQtySum: 0,
      costSum: 0,
      costCount: 0,
    };

    entry.costSum += cost;
    entry.costCount += 1;

    const qty =
      row.currentQuantity != null ? Number(row.currentQuantity) : null;
    if (qty != null && Number.isFinite(qty) && qty > 0) {
      entry.weightedValueSum += cost * qty;
      entry.positiveQtySum += qty;
    }

    accum.set(id, entry);
  }

  const map: Record<number, number> = {};
  for (const [id, entry] of accum) {
    if (entry.positiveQtySum > 0) {
      map[id] = entry.weightedValueSum / entry.positiveQtySum;
    } else if (entry.costCount > 0) {
      map[id] = entry.costSum / entry.costCount;
    }
  }
  return map;
}

/**
 * WAC keyed by Kho gốc (`branch_kind` × ingredient). Only positive costs;
 * multiple stock-bearing locations at the same source site are averaged.
 * Catalog cost prefers `buildCompanyWacMap`; this map remains for last-known
 * movement keys.
 */
export function buildSourceSiteWacMap(
  rows: readonly SourceSiteWacRow[],
): Record<string, number> {
  const accum = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    if (!isMenuRecipeSourceSiteKind(row.branchKind)) continue;
    const cost = Number(row.avgUnitCost);
    if (!isPositiveUnitCost(cost)) continue;
    const id = Number(row.ingredientId);
    if (!Number.isFinite(id) || id <= 0) continue;
    const key = menuRecipeSourceWacKey(row.branchKind, id);
    const entry = accum.get(key) ?? { sum: 0, count: 0 };
    entry.sum += cost;
    entry.count += 1;
    accum.set(key, entry);
  }

  const map: Record<string, number> = {};
  for (const [key, entry] of accum) {
    map[key] = entry.sum / entry.count;
  }
  return map;
}

function resolveCompanyMenuRecipeUnitCost({
  ingredientId,
  companyWacMap,
  sourceSiteWacMap,
  branchFallbackWacMap,
  lastKnownSourceWacMap,
}: {
  ingredientId: number;
  companyWacMap?: Readonly<Record<number, number>>;
  sourceSiteWacMap: Readonly<Record<string, number>>;
  branchFallbackWacMap?: Readonly<Record<number, number>>;
  lastKnownSourceWacMap?: Readonly<Record<string, number>>;
}): number | null {
  const companyWac = companyWacMap?.[ingredientId];
  if (isPositiveUnitCost(companyWac)) return companyWac;

  const supplyWac =
    sourceSiteWacMap[menuRecipeSourceWacKey("central_supply", ingredientId)];
  const kitchenWac =
    sourceSiteWacMap[menuRecipeSourceWacKey("central_kitchen", ingredientId)];
  const siteCosts = [supplyWac, kitchenWac].filter(isPositiveUnitCost);
  if (siteCosts.length === 1) return siteCosts[0] ?? null;
  if (siteCosts.length > 1) {
    return siteCosts.reduce((sum, cost) => sum + cost, 0) / siteCosts.length;
  }

  const branchWac = branchFallbackWacMap?.[ingredientId];
  if (isPositiveUnitCost(branchWac)) return branchWac;

  const lastSupply =
    lastKnownSourceWacMap?.[
      menuRecipeSourceWacKey("central_supply", ingredientId)
    ];
  if (isPositiveUnitCost(lastSupply)) return lastSupply;
  const lastKitchen =
    lastKnownSourceWacMap?.[
      menuRecipeSourceWacKey("central_kitchen", ingredientId)
    ];
  if (isPositiveUnitCost(lastKitchen)) return lastKitchen;

  return null;
}

export function resolveMenuRecipeUnitCost({
  ingredientId,
  sourceSiteKind,
  sourceSiteWacMap,
  branchFallbackWacMap,
  lastKnownSourceWacMap,
  companyWacMap,
}: {
  ingredientId: number;
  sourceSiteKind: string | null | undefined;
  sourceSiteWacMap: Readonly<Record<string, number>>;
  /** Live positive WAC at sales Chi nhánh when Kho gốc is depleted to 0. */
  branchFallbackWacMap?: Readonly<Record<number, number>>;
  /** Last positive movement unit_cost at Kho gốc (site × ingredient). */
  lastKnownSourceWacMap?: Readonly<Record<string, number>>;
  companyWacMap?: Readonly<Record<number, number>>;
}): number | null {
  if (!isMenuRecipeSourceSiteKind(sourceSiteKind)) return null;
  return resolveCompanyMenuRecipeUnitCost({
    ingredientId,
    companyWacMap,
    sourceSiteWacMap,
    branchFallbackWacMap,
    lastKnownSourceWacMap,
  });
}

/** Null when any line lacks a valued unit cost — never show a partial 0đ. */
export function sumMenuRecipeEstimatedCost(
  lineCosts: readonly (number | null)[],
): number | null {
  if (lineCosts.length === 0) return null;
  let sum = 0;
  for (const cost of lineCosts) {
    if (cost == null) return null;
    sum += cost;
  }
  return sum;
}

/** Editor/list signals — does not change the cost formula. */
export type MenuRecipeCostSignal =
  | "missing_fulfill_site"
  | "missing_source_wac"
  | "source_wac_site_mismatch";

export type MenuRecipeListCostState =
  | { kind: "amount"; amount: number }
  | { kind: "missing_recipe" }
  | { kind: "missing_fulfill_site" }
  | { kind: "missing_source_wac" }
  | { kind: "source_wac_site_mismatch" }
  | { kind: "unavailable" };

/**
 * One list label: Kho gốc WAC (or fallback) or a single gap — never a VND
 * amount plus a badge. When the WAC map failed to load, never claim
 * “Chờ định giá”. Prefer a valued amount over a mismatch-only gap.
 */
export function resolveMenuRecipeListCostState({
  itemCount,
  estimatedCost,
  signals,
  wacMapAvailable = true,
}: {
  itemCount: number;
  estimatedCost: number | null;
  signals: readonly MenuRecipeCostSignal[];
  wacMapAvailable?: boolean;
}): MenuRecipeListCostState {
  if (itemCount <= 0) return { kind: "missing_recipe" };
  if (signals.includes("missing_fulfill_site")) {
    return { kind: "missing_fulfill_site" };
  }
  if (!wacMapAvailable) return { kind: "unavailable" };
  if (estimatedCost != null && Number.isFinite(estimatedCost)) {
    return { kind: "amount", amount: estimatedCost };
  }
  if (signals.includes("missing_source_wac")) {
    return { kind: "missing_source_wac" };
  }
  if (signals.includes("source_wac_site_mismatch")) {
    return { kind: "source_wac_site_mismatch" };
  }
  return { kind: "unavailable" };
}

export function resolveMenuRecipeCostSignals({
  ingredientId,
  sourceSiteKind,
  sourceSiteWacMap,
  branchFallbackWacMap,
  lastKnownSourceWacMap,
  companyWacMap,
}: {
  ingredientId: number;
  sourceSiteKind: string | null | undefined;
  sourceSiteWacMap: Readonly<Record<string, number>>;
  branchFallbackWacMap?: Readonly<Record<number, number>>;
  lastKnownSourceWacMap?: Readonly<Record<string, number>>;
  companyWacMap?: Readonly<Record<number, number>>;
}): MenuRecipeCostSignal[] {
  if (!isMenuRecipeSourceSiteKind(sourceSiteKind)) {
    return ["missing_fulfill_site"];
  }
  if (
    resolveCompanyMenuRecipeUnitCost({
      ingredientId,
      companyWacMap,
      sourceSiteWacMap,
      branchFallbackWacMap,
      lastKnownSourceWacMap,
    }) != null
  ) {
    return [];
  }
  return ["missing_source_wac"];
}

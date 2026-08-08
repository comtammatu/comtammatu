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
};

export function getMenuRecipeLineBaseQuantity({
  quantity,
  entryUnitId,
  units,
}: RecipeLineBaseQuantityInput): number {
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;

  if (entryUnitId == null) {
    return safeQuantity;
  }

  const entryUnit = units?.find(
    (unit) => unit.unit_id === entryUnitId && unit.is_active,
  );
  const factor = entryUnit?.to_base_factor;

  if (typeof factor === "number" && Number.isFinite(factor) && factor > 0) {
    return safeQuantity * factor;
  }

  return safeQuantity;
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
 * WAC keyed by Kho gốc (`branch_kind` × ingredient). Only positive costs;
 * multiple stock-bearing locations at the same source site are averaged.
 * Never mixes central_supply with central_kitchen.
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

export function resolveMenuRecipeUnitCost({
  ingredientId,
  sourceSiteKind,
  sourceSiteWacMap,
  referenceUnitCost,
}: {
  ingredientId: number;
  sourceSiteKind: string | null | undefined;
  sourceSiteWacMap: Readonly<Record<string, number>>;
  referenceUnitCost: number | null | undefined;
}): number | null {
  if (isMenuRecipeSourceSiteKind(sourceSiteKind)) {
    const sourceWac =
      sourceSiteWacMap[menuRecipeSourceWacKey(sourceSiteKind, ingredientId)];
    if (isPositiveUnitCost(sourceWac)) return sourceWac;
  }
  if (isPositiveUnitCost(referenceUnitCost)) return referenceUnitCost;
  return null;
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

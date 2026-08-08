import type { IngredientUnitRow } from "@lib/inventory/types";

type RecipeLineBaseQuantityInput = {
  quantity: number;
  entryUnitId: number | null;
  units?: readonly IngredientUnitRow[] | null;
};

export type StockWacRow = {
  ingredientId: number;
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

/**
 * Average only positive stock WACs so zero placeholders (e.g. empty central
 * supply rows) do not dilute or replace a valued site’s avg_unit_cost.
 */
export function buildValuedWacMap(
  rows: readonly StockWacRow[],
): Record<string, number> {
  const accum = new Map<number, { sum: number; count: number }>();
  for (const row of rows) {
    const cost = Number(row.avgUnitCost);
    if (!isPositiveUnitCost(cost)) continue;
    const id = Number(row.ingredientId);
    if (!Number.isFinite(id) || id <= 0) continue;
    const entry = accum.get(id) ?? { sum: 0, count: 0 };
    entry.sum += cost;
    entry.count += 1;
    accum.set(id, entry);
  }

  const map: Record<string, number> = {};
  for (const [id, entry] of accum) {
    map[String(id)] = entry.sum / entry.count;
  }
  return map;
}

export function resolveMenuRecipeUnitCost({
  valuedWac,
  referenceUnitCost,
}: {
  valuedWac: number | undefined;
  referenceUnitCost: number | null | undefined;
}): number | null {
  if (isPositiveUnitCost(valuedWac)) return valuedWac;
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

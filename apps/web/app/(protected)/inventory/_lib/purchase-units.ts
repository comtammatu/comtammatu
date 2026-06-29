import type { IngredientRow, IngredientUnitRow } from "./types";

export interface PurchaseUnitOption {
  unitId: number;
  code: string;
  isBase: boolean;
}

/**
 * Selectable purchase-role units for an ingredient: its ingredient_units rows
 * where allow_purchase is true, base unit first. Returns [] when the ingredient
 * carries no units[] (leaner query / legacy data) so callers can fall back to a
 * free-text unit input.
 */
export function getPurchaseUnitOptions(
  ingredient: IngredientRow | undefined,
): PurchaseUnitOption[] {
  const units = ingredient?.units ?? [];
  return units
    .filter((u: IngredientUnitRow) => u.allow_purchase && u.unit_code !== "")
    .sort((a, b) => {
      if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
      return a.sort_order - b.sort_order;
    })
    .map((u) => ({ unitId: u.unit_id, code: u.unit_code, isBase: u.is_base }));
}

/**
 * Default purchase unit for an ingredient: the base purchase unit when present,
 * else the first purchase-role unit, else null.
 */
export function getDefaultPurchaseUnit(
  ingredient: IngredientRow | undefined,
): PurchaseUnitOption | null {
  const options = getPurchaseUnitOptions(ingredient);
  return options.find((o) => o.isBase) ?? options[0] ?? null;
}

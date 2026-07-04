import type { IngredientUnitRow } from "./types";

export interface PurchaseUnitOption {
  unitId: number;
  code: string;
  label: string;
  isBase: boolean;
}

// Structurally accepts IngredientRow plus any narrower ingredient shape that
// still carries `units` (e.g. GRN create-from-supplier's local Ingredient type).
type IngredientWithUnits = { units?: IngredientUnitRow[] };

/**
 * Selectable purchase units for an ingredient: every active ingredient_units
 * row, base unit first.
 */
export function getPurchaseUnitOptions(
  ingredient: IngredientWithUnits | undefined,
): PurchaseUnitOption[] {
  const units = ingredient?.units ?? [];
  return units
    .filter((u: IngredientUnitRow) => u.is_active && u.unit_code !== "")
    .sort((a, b) => {
      if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
      return a.sort_order - b.sort_order;
    })
    .map((u) => ({
      unitId: u.unit_id,
      code: u.unit_code,
      label: u.unit_name?.trim() || u.unit_code,
      isBase: u.is_base,
    }));
}

/**
 * Default purchase unit for an ingredient: the base unit when present, else the
 * first active unit, else null.
 */
export function getDefaultPurchaseUnit(
  ingredient: IngredientWithUnits | undefined,
): PurchaseUnitOption | null {
  const options = getPurchaseUnitOptions(ingredient);
  return options.find((o) => o.isBase) ?? options[0] ?? null;
}

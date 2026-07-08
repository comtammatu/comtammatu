import type { IngredientUnitRow } from "./types";
import {
  getDefaultIngredientUnit,
  getIngredientUnitOptions,
  type InventoryUnitOption,
} from "./unit-options";

export type PurchaseUnitOption = InventoryUnitOption;

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
  return getIngredientUnitOptions(ingredient);
}

/**
 * Default purchase unit for an ingredient: the base unit when present, else the
 * first active unit, else null.
 */
export function getDefaultPurchaseUnit(
  ingredient: IngredientWithUnits | undefined,
): PurchaseUnitOption | null {
  return getDefaultIngredientUnit(getPurchaseUnitOptions(ingredient));
}

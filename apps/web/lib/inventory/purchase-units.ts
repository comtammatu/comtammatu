import type { IngredientUnitRow } from "./types";
import {
  getIngredientRoleUnit,
  getIngredientRoleUnitOptions,
  type InventoryUnitOption,
} from "./unit-options";

export type PurchaseUnitOption = InventoryUnitOption;

// Structurally accepts IngredientRow plus any narrower ingredient shape that
// still carries `units` (e.g. GRN create-from-supplier's local Ingredient type).
type IngredientWithUnits = {
  units?: IngredientUnitRow[];
  receipt_unit_id?: number | null;
};

/**
 * Selectable purchase units for an ingredient: every active ingredient_units
 * row, base unit first.
 */
export function getPurchaseUnitOptions(
  ingredient: IngredientWithUnits | undefined,
): PurchaseUnitOption[] {
  return getIngredientRoleUnitOptions(ingredient, "receipt");
}

export function getDefaultPurchaseUnit(
  ingredient: IngredientWithUnits | undefined,
): PurchaseUnitOption | null {
  return getIngredientRoleUnit(ingredient, "receipt");
}

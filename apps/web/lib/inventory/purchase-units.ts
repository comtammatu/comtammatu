import type { IngredientUnitRow } from "./types";
import {
  getDefaultIngredientUnit,
  getIngredientUnitOptions,
  type InventoryUnitOption,
} from "./unit-options";

export type PurchaseUnitOption = InventoryUnitOption;

// Structurally accepts IngredientRow plus any narrower ingredient shape that
// still carries `units` (e.g. GRN create-from-supplier's local Ingredient type).
type IngredientWithUnits = {
  units?: IngredientUnitRow[];
};

export function getPurchaseUnitOptions(
  ingredient: IngredientWithUnits | undefined,
): PurchaseUnitOption[] {
  return getIngredientUnitOptions(ingredient);
}

export function getDefaultPurchaseUnit(
  ingredient: IngredientWithUnits | undefined,
): PurchaseUnitOption | null {
  return getDefaultIngredientUnit(getPurchaseUnitOptions(ingredient));
}

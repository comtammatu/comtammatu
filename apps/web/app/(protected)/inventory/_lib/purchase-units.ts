import type { IngredientUnitRow } from "./types";
import {
  getIngredientUnitOptions,
  type InventoryUnitOption,
  type InventoryUnitOptionWithFactor,
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

export function getDefaultPurchaseUnit(
  ingredient: IngredientWithUnits | undefined,
): PurchaseUnitOption | null {
  const options = getIngredientUnitOptions(ingredient, {
    includeToBaseFactor: true,
  });
  const largestUnit = options.reduce<InventoryUnitOptionWithFactor | null>(
    (best, option) =>
      best == null || option.toBaseFactor > best.toBaseFactor ? option : best,
    null,
  );
  if (!largestUnit) return null;
  return {
    unitId: largestUnit.unitId,
    code: largestUnit.code,
    label: largestUnit.label,
    isBase: largestUnit.isBase,
  };
}

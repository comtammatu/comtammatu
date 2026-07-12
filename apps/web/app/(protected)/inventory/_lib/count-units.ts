import type { IngredientRow } from "./types";
import {
  getIngredientUnitOptions,
  type InventoryUnitOptionWithFactor,
} from "./unit-options";

export type CountUnitOption = InventoryUnitOptionWithFactor;

/**
 * Selectable counting units for an ingredient: every active ingredient_units
 * row, base unit first. Counting physical stock can be done in any of the
 * ingredient's units.
 */
export function getCountUnitOptions(
  ingredient: IngredientRow | undefined,
): CountUnitOption[] {
  return getIngredientUnitOptions(ingredient, { includeToBaseFactor: true });
}

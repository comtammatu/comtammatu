import type { IngredientRow } from "./types";
import {
  getDefaultIngredientUnit,
  getIngredientUnitOptions,
  type InventoryUnitOption,
} from "./unit-options";

export type CountUnitOption = InventoryUnitOption;

/**
 * Selectable counting units for an ingredient: every active ingredient_units
 * row, base unit first. Counting physical stock can be done in any of the
 * ingredient's units.
 */
export function getCountUnitOptions(
  ingredient: IngredientRow | undefined,
): CountUnitOption[] {
  return getIngredientUnitOptions(ingredient);
}

/**
 * Default counting unit for an ingredient: the base unit when present, else the
 * first available unit, else null.
 */
export function getDefaultCountUnit(
  ingredient: IngredientRow | undefined,
): CountUnitOption | null {
  return getDefaultIngredientUnit(getCountUnitOptions(ingredient));
}

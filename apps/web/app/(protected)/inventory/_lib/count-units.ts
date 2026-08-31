import type { IngredientRow } from "@lib/inventory/types";
import {
  getIngredientUnitOptions,
  getLargestIngredientUnit,
  type InventoryUnitOptionWithFactor,
} from "@lib/inventory/unit-options";

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

/**
 * Default counting unit from already-built options: largest packaging
 * (purchase) unit so operators count thùng/chai first; falls back to
 * base/output when only one unit exists.
 */
export function pickDefaultCountUnit(
  options: readonly CountUnitOption[],
): CountUnitOption | null {
  return getLargestIngredientUnit(options);
}

/**
 * Default counting unit for an ingredient row (catalog helper).
 */
export function getDefaultCountUnit(
  ingredient: IngredientRow | undefined,
): CountUnitOption | null {
  return pickDefaultCountUnit(getCountUnitOptions(ingredient));
}

export {
  resolvePackLooseUnits as resolveCountPackLooseUnits,
  combinePackLooseQuantity as combineCountPackLooseQuantity,
  splitToPackLoose as splitCountToPackLoose,
  formatPackLooseQuantity as formatCountPackLooseQuantity,
} from "@lib/inventory/unit-options";

import type { IngredientRow } from "@lib/inventory/types";
import {
  getIngredientRoleUnit,
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
  const unit = getIngredientRoleUnit(ingredient, "issue");
  const factor = ingredient?.units?.find((row) => row.unit_id === unit?.unitId)
    ?.to_base_factor;
  return unit ? [{ ...unit, toBaseFactor: factor ?? 1 }] : [];
}

/**
 * Default counting unit from already-built options: largest packaging
 * (purchase) unit so operators count thùng/chai first; falls back to
 * base/output when only one unit exists.
 */
export function pickDefaultCountUnit(
  options: readonly CountUnitOption[],
): CountUnitOption | null {
  return options[0] ?? null;
}

/**
 * Default counting unit for an ingredient row (catalog helper).
 */
export function getDefaultCountUnit(
  ingredient: IngredientRow | undefined,
): CountUnitOption | null {
  return pickDefaultCountUnit(getCountUnitOptions(ingredient));
}

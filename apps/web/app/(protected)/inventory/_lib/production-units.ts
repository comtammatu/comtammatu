import type { IngredientUnitRow } from "@lib/inventory/types";
import {
  getIngredientRoleUnit,
  getIngredientRoleUnitOptions,
  type InventoryUnitOption,
} from "@lib/inventory/unit-options";

export type ProductionUnitOption = InventoryUnitOption;

/** Minimal shape needed to derive unit options: any object carrying units[]. */
type HasUnits = {
  units?: IngredientUnitRow[];
  production_unit_id?: number | null;
};

/**
 * Selectable production units for an ingredient: every active ingredient_units
 * row, base unit first.
 */
export function getProductionUnitOptions(
  ingredient: HasUnits | undefined,
): ProductionUnitOption[] {
  return getIngredientRoleUnitOptions(ingredient, "production");
}

/**
 * Default production unit for an ingredient: the base unit when present, else
 * the first active unit, else null.
 */
export function getDefaultProductionUnit(
  ingredient: HasUnits | undefined,
): ProductionUnitOption | null {
  return getIngredientRoleUnit(ingredient, "production");
}

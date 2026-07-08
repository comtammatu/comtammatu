import type { IngredientUnitRow } from "./types";
import {
  getDefaultIngredientUnit,
  getIngredientUnitOptions,
  type InventoryUnitOption,
} from "./unit-options";

export type ProductionUnitOption = InventoryUnitOption;

/** Minimal shape needed to derive unit options: any object carrying units[]. */
type HasUnits = { units?: IngredientUnitRow[] };

/**
 * Selectable production units for an ingredient: every active ingredient_units
 * row, base unit first.
 */
export function getProductionUnitOptions(
  ingredient: HasUnits | undefined,
): ProductionUnitOption[] {
  return getIngredientUnitOptions(ingredient);
}

/**
 * Default production unit for an ingredient: the base unit when present, else
 * the first active unit, else null.
 */
export function getDefaultProductionUnit(
  ingredient: HasUnits | undefined,
): ProductionUnitOption | null {
  return getDefaultIngredientUnit(getProductionUnitOptions(ingredient));
}

/**
 * Selectable units for an ingredient regardless of role (any active unit), base
 * unit first. Used for production-order finished-good output, where the output
 * is expressed in the finished good's own unit.
 */
export function getAnyUnitOptions(
  ingredient: HasUnits | undefined,
): ProductionUnitOption[] {
  return getIngredientUnitOptions(ingredient);
}

/**
 * Default unit for an ingredient: the base unit when present, else the first
 * active unit, else null.
 */
export function getDefaultAnyUnit(
  ingredient: HasUnits | undefined,
): ProductionUnitOption | null {
  return getDefaultIngredientUnit(getAnyUnitOptions(ingredient));
}

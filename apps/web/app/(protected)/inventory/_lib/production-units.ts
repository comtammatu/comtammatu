import type { IngredientUnitRow } from "./types";

export interface ProductionUnitOption {
  unitId: number;
  code: string;
  label: string;
  isBase: boolean;
}

/** Minimal shape needed to derive unit options: any object carrying units[]. */
type HasUnits = { units?: IngredientUnitRow[] };

/**
 * Selectable production units for an ingredient: every active ingredient_units
 * row, base unit first.
 */
export function getProductionUnitOptions(
  ingredient: HasUnits | undefined,
): ProductionUnitOption[] {
  const units = ingredient?.units ?? [];
  return units
    .filter((u: IngredientUnitRow) => u.is_active && u.unit_code !== "")
    .sort((a, b) => {
      if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
      return a.sort_order - b.sort_order;
    })
    .map((u) => ({
      unitId: u.unit_id,
      code: u.unit_code,
      label: u.unit_name?.trim() || u.unit_code,
      isBase: u.is_base,
    }));
}

/**
 * Default production unit for an ingredient: the base unit when present, else
 * the first active unit, else null.
 */
export function getDefaultProductionUnit(
  ingredient: HasUnits | undefined,
): ProductionUnitOption | null {
  const options = getProductionUnitOptions(ingredient);
  return options.find((o) => o.isBase) ?? options[0] ?? null;
}

/**
 * Selectable units for an ingredient regardless of role (any active unit), base
 * unit first. Used for production-order finished-good output, where the output
 * is expressed in the finished good's own unit.
 */
export function getAnyUnitOptions(
  ingredient: HasUnits | undefined,
): ProductionUnitOption[] {
  const units = ingredient?.units ?? [];
  return units
    .filter((u: IngredientUnitRow) => u.is_active && u.unit_code !== "")
    .sort((a, b) => {
      if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
      return a.sort_order - b.sort_order;
    })
    .map((u) => ({
      unitId: u.unit_id,
      code: u.unit_code,
      label: u.unit_name?.trim() || u.unit_code,
      isBase: u.is_base,
    }));
}

/**
 * Default unit for an ingredient: the base unit when present, else the first
 * active unit, else null.
 */
export function getDefaultAnyUnit(
  ingredient: HasUnits | undefined,
): ProductionUnitOption | null {
  const options = getAnyUnitOptions(ingredient);
  return options.find((o) => o.isBase) ?? options[0] ?? null;
}

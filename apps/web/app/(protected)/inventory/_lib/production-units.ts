import type { IngredientUnitRow } from "./types";

export interface ProductionUnitOption {
  unitId: number;
  code: string;
  isBase: boolean;
}

/** Minimal shape needed to derive unit options: any object carrying units[]. */
type HasUnits = { units?: IngredientUnitRow[] };

/**
 * Selectable production-role units for an ingredient: its ingredient_units rows
 * where allow_production is true, base unit first. Returns [] when the
 * ingredient carries no units[] (leaner query / legacy data) so callers can
 * fall back to a free-text unit input.
 */
export function getProductionUnitOptions(
  ingredient: HasUnits | undefined,
): ProductionUnitOption[] {
  const units = ingredient?.units ?? [];
  return units
    .filter((u: IngredientUnitRow) => u.allow_production && u.unit_code !== "")
    .sort((a, b) => {
      if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
      return a.sort_order - b.sort_order;
    })
    .map((u) => ({ unitId: u.unit_id, code: u.unit_code, isBase: u.is_base }));
}

/**
 * Default production unit for an ingredient: the base production unit when
 * present, else the first production-role unit, else null.
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
 * is expressed in the finished good's own unit. Returns [] when the ingredient
 * carries no units[] so callers can fall back to a free-text unit input.
 */
export function getAnyUnitOptions(
  ingredient: HasUnits | undefined,
): ProductionUnitOption[] {
  const units = ingredient?.units ?? [];
  return units
    .filter((u: IngredientUnitRow) => u.unit_code !== "")
    .sort((a, b) => {
      if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
      return a.sort_order - b.sort_order;
    })
    .map((u) => ({ unitId: u.unit_id, code: u.unit_code, isBase: u.is_base }));
}

/**
 * Default unit (any active role) for an ingredient: the base unit when present,
 * else the first unit, else null.
 */
export function getDefaultAnyUnit(
  ingredient: HasUnits | undefined,
): ProductionUnitOption | null {
  const options = getAnyUnitOptions(ingredient);
  return options.find((o) => o.isBase) ?? options[0] ?? null;
}

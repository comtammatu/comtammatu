import type { IngredientRow, IngredientUnitRow } from "./types";

export interface CountUnitOption {
  unitId: number;
  code: string;
  label: string;
  isBase: boolean;
}

/**
 * Selectable counting units for an ingredient: every active ingredient_units
 * row, base unit first. Counting physical stock can be done in any of the
 * ingredient's units, so this is NOT filtered by role (allow_purchase/issue/
 * production).
 */
export function getCountUnitOptions(
  ingredient: IngredientRow | undefined,
): CountUnitOption[] {
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
 * Default counting unit for an ingredient: the base unit when present, else the
 * first available unit, else null.
 */
export function getDefaultCountUnit(
  ingredient: IngredientRow | undefined,
): CountUnitOption | null {
  const options = getCountUnitOptions(ingredient);
  return options.find((o) => o.isBase) ?? options[0] ?? null;
}

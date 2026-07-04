import type { IngredientUnitRow } from "./types";

export interface IssueUnitOption {
  unitId: number;
  code: string;
  label: string;
  isBase: boolean;
}

/**
 * Selectable issue units for an ingredient: every active ingredient_units row,
 * base unit first.
 */
type IngredientWithUnits = { units?: IngredientUnitRow[] };

export function getIssueUnitOptions(
  ingredient: IngredientWithUnits | undefined,
): IssueUnitOption[] {
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
 * Default issue unit for an ingredient: the base unit when present, else the
 * first active unit, else null.
 */
export function getDefaultIssueUnit(
  ingredient: IngredientWithUnits | undefined,
): IssueUnitOption | null {
  const options = getIssueUnitOptions(ingredient);
  return options.find((o) => o.isBase) ?? options[0] ?? null;
}

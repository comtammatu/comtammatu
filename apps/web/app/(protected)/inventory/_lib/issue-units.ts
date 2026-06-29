import type { IngredientRow, IngredientUnitRow } from "./types";

export interface IssueUnitOption {
  unitId: number;
  code: string;
  isBase: boolean;
}

/**
 * Selectable issue-role units for an ingredient: its ingredient_units rows
 * where allow_issue is true, base unit first. Returns [] when the ingredient
 * carries no units[] so callers can fall back to a free-text unit input.
 */
export function getIssueUnitOptions(
  ingredient: IngredientRow | undefined,
): IssueUnitOption[] {
  const units = ingredient?.units ?? [];
  return units
    .filter((u: IngredientUnitRow) => u.allow_issue && u.unit_code !== "")
    .sort((a, b) => {
      if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
      return a.sort_order - b.sort_order;
    })
    .map((u) => ({ unitId: u.unit_id, code: u.unit_code, isBase: u.is_base }));
}

/**
 * Default issue unit for an ingredient: the base issue unit when present,
 * else the first issue-role unit, else null.
 */
export function getDefaultIssueUnit(
  ingredient: IngredientRow | undefined,
): IssueUnitOption | null {
  const options = getIssueUnitOptions(ingredient);
  return options.find((o) => o.isBase) ?? options[0] ?? null;
}

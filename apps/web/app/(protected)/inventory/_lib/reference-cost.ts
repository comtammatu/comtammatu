import type { IngredientUnitRow } from "./types";

type IngredientWithReferenceCost = {
  unit_cost?: number | string | null;
  units?: IngredientUnitRow[];
};

export type ReferenceCost = {
  value: number;
  unit: string;
  unitId: number | null;
  isBase: boolean;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function activeUnits(ingredient: IngredientWithReferenceCost) {
  return [...(ingredient.units ?? [])]
    .filter((unit) => unit.is_active && unit.unit_code !== "")
    .sort((a, b) => {
      if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
      return a.sort_order - b.sort_order;
    });
}

function buildReferenceCost(
  baseCost: number,
  unit: IngredientUnitRow,
): ReferenceCost {
  return {
    value: Number((baseCost * unit.to_base_factor).toFixed(2)),
    unit: unit.unit_name?.trim() || unit.unit_code,
    unitId: unit.unit_id,
    isBase: unit.is_base,
  };
}

export function getReferenceCostForUnit(
  ingredient: IngredientWithReferenceCost | undefined,
  entryUnitId: number | null | undefined,
  fallbackUnit?: string,
): ReferenceCost | null {
  if (!ingredient) return null;
  const baseCost = toNumber(ingredient.unit_cost);
  if (baseCost == null) return null;

  const units = activeUnits(ingredient);
  const selected =
    entryUnitId != null
      ? units.find((unit) => unit.unit_id === entryUnitId)
      : units.find((unit) => unit.is_base);

  if (selected) return buildReferenceCost(baseCost, selected);

  return {
    value: baseCost,
    unit:
      fallbackUnit?.trim() ||
      units.find((unit) => unit.is_base)?.unit_code ||
      "",
    unitId: null,
    isBase: true,
  };
}

export function getDisplayReferenceCost(
  ingredient: IngredientWithReferenceCost,
): ReferenceCost | null {
  const baseCost = toNumber(ingredient.unit_cost);
  if (baseCost == null) return null;

  const units = activeUnits(ingredient);
  const displayUnit =
    units.reduce<IngredientUnitRow | null>(
      (best, unit) =>
        best == null || unit.to_base_factor > best.to_base_factor ? unit : best,
      null,
    ) ?? null;

  if (!displayUnit) {
    return { value: baseCost, unit: "", unitId: null, isBase: true };
  }

  return buildReferenceCost(baseCost, displayUnit);
}

import type { IngredientUnitRow } from "./types";

export interface InventoryUnitOption {
  unitId: number;
  code: string;
  label: string;
  isBase: boolean;
}

export interface InventoryUnitOptionWithFactor extends InventoryUnitOption {
  toBaseFactor: number;
}

type IngredientWithUnits = { units?: IngredientUnitRow[] };

function activeUnits(ingredient: IngredientWithUnits | undefined) {
  return [...(ingredient?.units ?? [])]
    .filter((unit) => unit.is_active && unit.unit_code !== "")
    .sort((a, b) => {
      if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
      return a.sort_order - b.sort_order;
    });
}

export function getIngredientUnitOptions(
  ingredient: IngredientWithUnits | undefined,
): InventoryUnitOption[];
export function getIngredientUnitOptions(
  ingredient: IngredientWithUnits | undefined,
  options: { includeToBaseFactor: true },
): InventoryUnitOptionWithFactor[];
export function getIngredientUnitOptions(
  ingredient: IngredientWithUnits | undefined,
  options?: { includeToBaseFactor?: boolean },
): InventoryUnitOption[] | InventoryUnitOptionWithFactor[] {
  return activeUnits(ingredient).map((unit) => {
    const option: InventoryUnitOption = {
      unitId: unit.unit_id,
      code: unit.unit_code,
      label: unit.unit_name?.trim() || unit.unit_code,
      isBase: unit.is_base,
    };
    return options?.includeToBaseFactor === true
      ? { ...option, toBaseFactor: unit.to_base_factor }
      : option;
  });
}

export function getDefaultIngredientUnit<T extends InventoryUnitOption>(
  options: readonly T[],
): T | null {
  return options.find((option) => option.isBase) ?? options[0] ?? null;
}

export function getLargestIngredientUnit<
  T extends InventoryUnitOptionWithFactor,
>(options: readonly T[]): T | null {
  return options.reduce<T | null>(
    (best, option) =>
      best == null || option.toBaseFactor > best.toBaseFactor ? option : best,
    null,
  );
}

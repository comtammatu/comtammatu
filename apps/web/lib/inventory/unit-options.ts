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

export function resolvePackLooseUnits<
  T extends InventoryUnitOptionWithFactor,
>(
  options: readonly T[],
): {
  packUnit: T;
  looseUnit: T;
  packFactor: number;
} | null {
  if (options.length <= 1) return null;
  const packUnit = getLargestIngredientUnit(options);
  const looseUnit = options.find((opt) => opt.isBase) ?? options[0];
  if (
    !packUnit ||
    !looseUnit ||
    packUnit.unitId === looseUnit.unitId ||
    !(packUnit.toBaseFactor > looseUnit.toBaseFactor) ||
    !(looseUnit.toBaseFactor > 0)
  ) {
    return null;
  }
  return {
    packUnit,
    looseUnit,
    packFactor: packUnit.toBaseFactor / looseUnit.toBaseFactor,
  };
}

export function combinePackLooseQuantity(
  packQty: number,
  looseQty: number,
  packFactor: number,
): number {
  const safePack = Number.isFinite(packQty) ? Math.max(0, packQty) : 0;
  const safeLoose = Number.isFinite(looseQty) ? Math.max(0, looseQty) : 0;
  return Math.round((safePack * packFactor + safeLoose) * 1000) / 1000;
}

export function splitToPackLoose(
  totalLooseQty: number,
  packFactor: number,
): { packQty: number; looseQty: number } {
  if (!(packFactor > 0) || !Number.isFinite(totalLooseQty)) {
    return { packQty: 0, looseQty: Math.max(0, totalLooseQty || 0) };
  }
  const safe = Math.max(0, totalLooseQty);
  const packQty = Math.floor((safe + 1e-9) / packFactor);
  const looseQty = Math.round((safe - packQty * packFactor) * 1000) / 1000;
  return { packQty, looseQty };
}

export function formatPackLooseQuantity(
  packQty: number,
  packLabel: string,
  looseQty: number,
  looseLabel: string,
): string {
  const packText = `${packQty} ${packLabel}`;
  const looseText = `${looseQty} ${looseLabel}`;
  if (packQty > 0 && looseQty > 0) return `${packText} + ${looseText}`;
  if (packQty > 0) return packText;
  if (looseQty > 0) return looseText;
  return `0 ${looseLabel}`;
}

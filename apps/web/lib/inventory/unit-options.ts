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
type IngredientWithUnitRoles = IngredientWithUnits & {
  receipt_unit_id?: number | null;
  issue_unit_id?: number | null;
  production_unit_id?: number | null;
};

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

export function getLargestIngredientUnit<T extends InventoryUnitOptionWithFactor>(
  options: readonly T[],
): T | null {
  return options.reduce<T | null>(
    (best, option) =>
      best == null || option.toBaseFactor > best.toBaseFactor ? option : best,
    null,
  );
}

export type InventoryUnitRole = "receipt" | "issue" | "production";

export function getIngredientRoleUnit(
  ingredient: IngredientWithUnitRoles | undefined,
  role: InventoryUnitRole,
): InventoryUnitOption | null {
  const unitId = ingredient?.[`${role}_unit_id`];
  if (unitId == null) return null;
  return getIngredientUnitOptions(ingredient).find(
    (unit) => unit.unitId === unitId,
  ) ?? null;
}

export function getIngredientRoleUnitOptions(
  ingredient: IngredientWithUnitRoles | undefined,
  role: InventoryUnitRole,
): InventoryUnitOption[] {
  return getRoleUnitOptions(ingredient, [role]);
}

/**
 * Unique active units for the given catalog roles, preserving `roles` order
 * and dropping duplicates when the same unit fills more than one role.
 */
export function getRoleUnitOptions(
  ingredient: IngredientWithUnitRoles | undefined,
  roles: readonly InventoryUnitRole[],
): InventoryUnitOption[] {
  const seen = new Set<number>();
  const options: InventoryUnitOption[] = [];
  for (const role of roles) {
    const unit = getIngredientRoleUnit(ingredient, role);
    if (!unit || seen.has(unit.unitId)) continue;
    seen.add(unit.unitId);
    options.push(unit);
  }
  return options;
}

export function getRoleUnitOptionsWithFactor(
  ingredient: IngredientWithUnitRoles | undefined,
  roles: readonly InventoryUnitRole[],
): InventoryUnitOptionWithFactor[] {
  return getRoleUnitOptions(ingredient, roles).map((unit) => {
    const factor = ingredient?.units?.find((row) => row.unit_id === unit.unitId)
      ?.to_base_factor;
    return { ...unit, toBaseFactor: factor ?? 1 };
  });
}

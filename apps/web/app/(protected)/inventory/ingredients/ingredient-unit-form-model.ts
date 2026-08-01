import type { UnitOption } from "@lib/inventory/types";

export type CatalogUnitPayload = {
  unit_id: number;
  to_base_factor: number;
  is_base: boolean;
  anchor_unit_id: number | null;
  anchor_factor: number | null;
};

export type UnitRoles = {
  receiptUnitId: number;
  issueUnitId: number;
  productionUnitId: number | null;
};

export class IngredientUnitModelError extends Error {
  constructor(
    message:
      | "unit_not_found"
      | "base_unit_not_in_roles"
      | "invalid_factor"
      | "standard_unit_dimension_mismatch",
  ) {
    super(message);
    this.name = "IngredientUnitModelError";
  }
}

export function distinctRoleUnitIds(roles: UnitRoles): number[] {
  return [
    ...new Set(
      [roles.receiptUnitId, roles.issueUnitId, roles.productionUnitId].filter(
        (id): id is number => id != null && Number.isInteger(id) && id > 0,
      ),
    ),
  ];
}

export function readCatalogUnitModel(
  rows: readonly {
    unit_id: number;
    to_base_factor: number;
    is_base: boolean;
  }[],
  issueUnitId: number | null,
): { baseUnitId: number | null; factors: Record<number, number> } {
  return {
    baseUnitId: rows.find((row) => row.is_base)?.unit_id ?? issueUnitId,
    factors: Object.fromEntries(
      rows.map((row) => [row.unit_id, row.to_base_factor]),
    ),
  };
}

export function rebaseUnitFactors(
  factors: Readonly<Record<number, number>>,
  newBaseUnitId: number,
): Record<number, number> {
  const baseFactor = factors[newBaseUnitId];
  if (baseFactor == null || !Number.isFinite(baseFactor) || baseFactor <= 0) {
    throw new IngredientUnitModelError("invalid_factor");
  }

  return Object.fromEntries(
    Object.entries(factors).map(([unitId, factor]) => {
      if (!Number.isFinite(factor) || factor <= 0) {
        throw new IngredientUnitModelError("invalid_factor");
      }
      return [Number(unitId), factor / baseFactor];
    }),
  );
}

export function buildCatalogUnits({
  roles,
  baseUnitId,
  factors,
  unitOptions,
}: {
  roles: UnitRoles;
  baseUnitId: number;
  factors: Readonly<Record<number, number>>;
  unitOptions: readonly UnitOption[];
}): CatalogUnitPayload[] {
  const unitIds = distinctRoleUnitIds(roles);
  if (!unitIds.includes(baseUnitId)) {
    throw new IngredientUnitModelError("base_unit_not_in_roles");
  }

  const unitsById = new Map(unitOptions.map((unit) => [unit.id, unit]));
  const baseUnit = unitsById.get(baseUnitId);
  if (!baseUnit) throw new IngredientUnitModelError("unit_not_found");

  return unitIds.map((unitId) => {
    const unit = unitsById.get(unitId);
    if (!unit) throw new IngredientUnitModelError("unit_not_found");
    if (unitId === baseUnitId) {
      return {
        unit_id: unitId,
        to_base_factor: 1,
        is_base: true,
        anchor_unit_id: null,
        anchor_factor: null,
      };
    }

    const registryFactor =
      unit.is_standard && baseUnit.is_standard
        ? standardFactor(unit, baseUnit)
        : null;
    const factor = registryFactor ?? factors[unitId];
    if (factor == null || !Number.isFinite(factor) || factor <= 0) {
      throw new IngredientUnitModelError("invalid_factor");
    }

    return {
      unit_id: unitId,
      to_base_factor: factor,
      is_base: false,
      anchor_unit_id: registryFactor == null ? baseUnitId : null,
      anchor_factor: registryFactor == null ? factor : null,
    };
  });
}

export function standardFactor(unit: UnitOption, baseUnit: UnitOption): number {
  if (
    !unit.is_standard ||
    !baseUnit.is_standard ||
    unit.dimension == null ||
    unit.dimension !== baseUnit.dimension ||
    unit.standard_factor == null ||
    baseUnit.standard_factor == null ||
    unit.standard_factor <= 0 ||
    baseUnit.standard_factor <= 0
  ) {
    throw new IngredientUnitModelError("standard_unit_dimension_mismatch");
  }
  return unit.standard_factor / baseUnit.standard_factor;
}

import type { UnitOption } from "@lib/inventory/types";

export type CatalogUnitPayload = {
  unit_id: number;
  to_base_factor: number;
  is_base: boolean;
  anchor_unit_id: number | null;
  anchor_factor: number | null;
};

export class IngredientUnitModelError extends Error {
  constructor(
    message:
      | "unit_not_found"
      | "base_unit_not_selected"
      | "invalid_factor"
      | "standard_unit_dimension_mismatch",
  ) {
    super(message);
    this.name = "IngredientUnitModelError";
  }
}

export function readCatalogUnitModel(
  rows: readonly {
    unit_id: number;
    to_base_factor: number;
    is_base: boolean;
  }[],
  fallbackUnitId: number | null,
): { baseUnitId: number | null; factors: Record<number, number> } {
  return {
    baseUnitId: rows.find((row) => row.is_base)?.unit_id ?? fallbackUnitId,
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
  unitIds,
  baseUnitId,
  factors,
  unitOptions,
}: {
  unitIds: readonly number[];
  baseUnitId: number;
  factors: Readonly<Record<number, number>>;
  unitOptions: readonly UnitOption[];
}): CatalogUnitPayload[] {
  const selectedUnitIds = [...new Set(unitIds)];
  if (!selectedUnitIds.includes(baseUnitId)) {
    throw new IngredientUnitModelError("base_unit_not_selected");
  }

  const unitsById = new Map(unitOptions.map((unit) => [unit.id, unit]));
  const baseUnit = unitsById.get(baseUnitId);
  if (!baseUnit) throw new IngredientUnitModelError("unit_not_found");

  return selectedUnitIds.map((unitId) => {
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

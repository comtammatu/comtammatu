import type { UnitOption } from "@lib/inventory/types";

export type CatalogUnitPayload = {
  unit_id: number;
  to_base_factor: number;
  is_base: boolean;
  anchor_unit_id: number | null;
  anchor_factor: number | null;
};

export type IngredientUnitModelErrorCode =
  | "unit_not_found"
  | "base_unit_not_selected"
  | "anchor_unit_not_selected"
  | "invalid_factor"
  | "anchor_factor_out_of_range"
  | "effective_factor_out_of_range"
  | "unit_anchor_cycle"
  | "standard_unit_dimension_mismatch";

export type UnitRelationModel = {
  baseUnitId: number | null;
  anchorUnitIds: Record<number, number | null>;
  anchorFactors: Record<number, number | null>;
  factors: Record<number, number>;
};

export type UnitRelationInput = {
  unitIds: readonly number[];
  baseUnitId: number;
  anchorUnitIds: Readonly<Record<number, number | null>>;
  anchorFactors: Readonly<Record<number, number | string | null>>;
  unitOptions: readonly UnitOption[];
};

export type LegacyUnitRelationInput = {
  unitIds: readonly number[];
  baseUnitId: number;
  factors: Readonly<Record<number, number>>;
  unitOptions: readonly UnitOption[];
  anchorUnitIds?: never;
  anchorFactors?: never;
};

const ANCHOR_INTEGER_DIGITS = 9;
const ANCHOR_SCALE = 9;
const EFFECTIVE_INTEGER_DIGITS = 6;
const EFFECTIVE_SCALE = 12;
const FLOATING_POINT_TOLERANCE = 8;

export class IngredientUnitModelError extends Error {
  constructor(message: IngredientUnitModelErrorCode) {
    super(message);
    this.name = "IngredientUnitModelError";
  }
}

export function isValidAnchorFactor(value: unknown): boolean {
  return isValidDatabaseNumeric(
    value,
    ANCHOR_INTEGER_DIGITS,
    ANCHOR_SCALE,
  );
}

export function isValidEffectiveFactor(value: unknown): boolean {
  return isValidDatabaseNumeric(
    value,
    EFFECTIVE_INTEGER_DIGITS,
    EFFECTIVE_SCALE,
  );
}

export function readCatalogUnitModel(
  rows: readonly {
    unit_id: number;
    to_base_factor: number;
    is_base: boolean;
    anchor_unit_id?: number | null;
    anchor_factor?: number | null;
  }[],
  fallbackUnitId: number | null,
  unitOptions?: readonly UnitOption[],
): UnitRelationModel {
  const baseUnitId = rows.find((row) => row.is_base)?.unit_id ?? fallbackUnitId;
  const unitsById = new Map(unitOptions?.map((unit) => [unit.id, unit]));
  const baseUnit = baseUnitId == null ? null : unitsById.get(baseUnitId);
  const anchorUnitIds: Record<number, number | null> = {};
  const anchorFactors: Record<number, number | null> = {};
  const factors = Object.fromEntries(
    rows.map((row) => [row.unit_id, row.to_base_factor]),
  );

  for (const row of rows) {
    if (row.is_base) {
      anchorUnitIds[row.unit_id] = null;
      anchorFactors[row.unit_id] = null;
      continue;
    }

    if (row.anchor_unit_id != null) {
      anchorUnitIds[row.unit_id] = row.anchor_unit_id;
      anchorFactors[row.unit_id] = row.anchor_factor ?? null;
      continue;
    }

    const unit = unitsById.get(row.unit_id);
    anchorUnitIds[row.unit_id] = baseUnitId;
    anchorFactors[row.unit_id] =
      unit != null && baseUnit != null && isAutomaticStandardRelation(unit, baseUnit)
        ? null
        : row.to_base_factor;
  }

  return { baseUnitId, anchorUnitIds, anchorFactors, factors };
}

export function deriveEffectiveUnitFactor(
  input: UnitRelationInput,
  unitId: number,
): number {
  return createEffectiveFactorResolver(input).resolve(unitId, new Set());
}

export function deriveEffectiveUnitFactors(
  input: UnitRelationInput,
): Record<number, number> {
  const resolver = createEffectiveFactorResolver(input);
  for (const unitId of resolver.selectedUnitIds) {
    resolver.resolve(unitId, new Set());
  }
  return resolver.memo;
}

export function buildCatalogUnits(input: UnitRelationInput): CatalogUnitPayload[];
export function buildCatalogUnits(input: LegacyUnitRelationInput): CatalogUnitPayload[];
export function buildCatalogUnits(
  input: UnitRelationInput | LegacyUnitRelationInput,
): CatalogUnitPayload[] {
  const relations = normalizeUnitRelations(input);
  const factors = deriveEffectiveUnitFactors(relations);
  const unitsById = new Map(relations.unitOptions.map((unit) => [unit.id, unit]));
  const baseUnit = unitsById.get(relations.baseUnitId);
  if (!baseUnit) throw new IngredientUnitModelError("unit_not_found");

  return [...new Set(relations.unitIds)].map((unitId) => {
    if (unitId === relations.baseUnitId) {
      return {
        unit_id: unitId,
        to_base_factor: 1,
        is_base: true,
        anchor_unit_id: null,
        anchor_factor: null,
      };
    }

    const unit = unitsById.get(unitId);
    if (!unit) throw new IngredientUnitModelError("unit_not_found");
    const anchorUnitId = relations.anchorUnitIds[unitId];
    const automatic =
      anchorUnitId === relations.baseUnitId &&
      relations.anchorFactors[unitId] == null &&
      isAutomaticStandardRelation(unit, baseUnit);

    return {
      unit_id: unitId,
      to_base_factor: factors[unitId]!,
      is_base: false,
      anchor_unit_id: automatic ? null : anchorUnitId ?? null,
      anchor_factor:
        automatic || relations.anchorFactors[unitId] == null
          ? null
          : Number(relations.anchorFactors[unitId]),
    };
  });
}

export function findDirectDependents(
  anchorUnitIds: Readonly<Record<number, number | null>>,
  targetUnitId: number,
): number[] {
  return Object.entries(anchorUnitIds).flatMap(([unitId, anchorUnitId]) =>
    anchorUnitId === targetUnitId ? [Number(unitId)] : [],
  );
}

export function wouldCreateUnitCycle(
  anchorUnitIds: Readonly<Record<number, number | null>>,
  unitId: number,
  candidateAnchorUnitId: number,
): boolean {
  const visited = new Set<number>();
  let currentUnitId: number | null = candidateAnchorUnitId;

  while (currentUnitId != null) {
    if (currentUnitId === unitId || visited.has(currentUnitId)) return true;
    visited.add(currentUnitId);
    currentUnitId = anchorUnitIds[currentUnitId] ?? null;
  }

  return false;
}

export function rebaseUnitRelations(input: {
  unitIds: readonly number[];
  oldBaseUnitId: number;
  newBaseUnitId: number;
  anchorUnitIds: Readonly<Record<number, number | null>>;
  anchorFactors: Readonly<Record<number, number | string | null>>;
  unitOptions: readonly UnitOption[];
}): {
  anchorUnitIds: Record<number, number | null>;
  anchorFactors: Record<number, number | null>;
} {
  const unitIds = [...new Set(input.unitIds)];
  const oldEffective = deriveEffectiveUnitFactors({
    unitIds,
    baseUnitId: input.oldBaseUnitId,
    anchorUnitIds: input.anchorUnitIds,
    anchorFactors: input.anchorFactors,
    unitOptions: input.unitOptions,
  });
  const newBaseFactor = oldEffective[input.newBaseUnitId];
  if (newBaseFactor == null || !Number.isFinite(newBaseFactor) || newBaseFactor <= 0) {
    throw new IngredientUnitModelError("base_unit_not_selected");
  }

  const unitsById = new Map(input.unitOptions.map((unit) => [unit.id, unit]));
  const newBaseUnit = unitsById.get(input.newBaseUnitId);
  if (!newBaseUnit) throw new IngredientUnitModelError("unit_not_found");

  const anchorUnitIds: Record<number, number | null> = {};
  const anchorFactors: Record<number, number | null> = {};

  for (const unitId of unitIds) {
    if (unitId === input.newBaseUnitId) {
      anchorUnitIds[unitId] = null;
      anchorFactors[unitId] = null;
      continue;
    }

    if (pathReachesUnit(input.anchorUnitIds, unitId, input.newBaseUnitId)) {
      anchorUnitIds[unitId] = input.anchorUnitIds[unitId] ?? null;
      anchorFactors[unitId] =
        input.anchorFactors[unitId] == null
          ? null
          : Number(input.anchorFactors[unitId]);
      continue;
    }

    const unit = unitsById.get(unitId);
    if (!unit) throw new IngredientUnitModelError("unit_not_found");
    const calculatedRatio = oldEffective[unitId]! / newBaseFactor;
    anchorUnitIds[unitId] = input.newBaseUnitId;
    const standardRatio = isAutomaticStandardRelation(unit, newBaseUnit)
      ? standardFactor(unit, newBaseUnit)
      : null;
    const automaticRatio =
      standardRatio == null
        ? null
        : normalizeCalculatedFactor(
            standardRatio,
            EFFECTIVE_INTEGER_DIGITS,
            EFFECTIVE_SCALE,
            "effective_factor_out_of_range",
          );
    const effectiveRatio = normalizeCalculatedFactor(
      calculatedRatio,
      EFFECTIVE_INTEGER_DIGITS,
      EFFECTIVE_SCALE,
      "effective_factor_out_of_range",
    );
    anchorFactors[unitId] =
      automaticRatio != null && effectiveRatio === automaticRatio
        ? null
        : normalizeCalculatedFactor(
            calculatedRatio,
            ANCHOR_INTEGER_DIGITS,
            ANCHOR_SCALE,
            "anchor_factor_out_of_range",
          );
  }

  deriveEffectiveUnitFactors({
    unitIds,
    baseUnitId: input.newBaseUnitId,
    anchorUnitIds,
    anchorFactors,
    unitOptions: input.unitOptions,
  });
  return { anchorUnitIds, anchorFactors };
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

function createEffectiveFactorResolver(input: UnitRelationInput): {
  memo: Record<number, number>;
  resolve: (unitId: number, path: ReadonlySet<number>) => number;
  selectedUnitIds: number[];
} {
  const selectedUnitIds = [...new Set(input.unitIds)];
  const selectedUnitIdsSet = new Set(selectedUnitIds);
  if (!selectedUnitIdsSet.has(input.baseUnitId)) {
    throw new IngredientUnitModelError("base_unit_not_selected");
  }

  const unitsById = new Map(input.unitOptions.map((unit) => [unit.id, unit]));
  const baseUnit = unitsById.get(input.baseUnitId);
  if (!baseUnit) throw new IngredientUnitModelError("unit_not_found");

  const validateDimensionPath = (
    unitId: number,
    path: ReadonlySet<number>,
    chainDimension: string | null,
  ): void => {
    if (path.has(unitId)) {
      throw new IngredientUnitModelError("unit_anchor_cycle");
    }
    const unit = unitsById.get(unitId);
    if (!unit) throw new IngredientUnitModelError("unit_not_found");

    const unitDimension = unit.is_standard ? unit.dimension : null;
    if (
      chainDimension != null &&
      unitDimension != null &&
      chainDimension !== unitDimension
    ) {
      throw new IngredientUnitModelError("standard_unit_dimension_mismatch");
    }
    const nextDimension = chainDimension ?? unitDimension;
    if (unitId === input.baseUnitId) return;

    const anchorUnitId = input.anchorUnitIds[unitId];
    if (anchorUnitId == null || !selectedUnitIdsSet.has(anchorUnitId)) {
      throw new IngredientUnitModelError("anchor_unit_not_selected");
    }
    const nextPath = new Set(path);
    nextPath.add(unitId);
    validateDimensionPath(anchorUnitId, nextPath, nextDimension);
  };

  const memo: Record<number, number> = { [input.baseUnitId]: 1 };
  const resolveFactor = (unitId: number, path: ReadonlySet<number>): number => {
    const cached = memo[unitId];
    if (cached != null) return cached;
    if (path.has(unitId)) {
      throw new IngredientUnitModelError("unit_anchor_cycle");
    }

    const unit = unitsById.get(unitId);
    if (!unit) throw new IngredientUnitModelError("unit_not_found");

    const anchorUnitId = input.anchorUnitIds[unitId];
    if (anchorUnitId == null || !selectedUnitIdsSet.has(anchorUnitId)) {
      throw new IngredientUnitModelError("anchor_unit_not_selected");
    }
    if (anchorUnitId === unitId) {
      throw new IngredientUnitModelError("unit_anchor_cycle");
    }
    const anchorUnit = unitsById.get(anchorUnitId);
    if (!anchorUnit) throw new IngredientUnitModelError("unit_not_found");

    const manualFactor = input.anchorFactors[unitId];
    const automatic =
      anchorUnitId === input.baseUnitId &&
      manualFactor == null &&
      unit.is_standard &&
      baseUnit.is_standard;
    if (manualFactor != null && !automatic && !isValidAnchorFactor(manualFactor)) {
      const numericFactor = Number(manualFactor);
      if (!Number.isFinite(numericFactor) || numericFactor <= 0) {
        throw new IngredientUnitModelError("invalid_factor");
      }
      throw new IngredientUnitModelError("anchor_factor_out_of_range");
    }
    const edgeFactor = automatic
      ? standardFactor(unit, baseUnit)
      : Number(manualFactor);
    if (!Number.isFinite(edgeFactor) || edgeFactor <= 0) {
      throw new IngredientUnitModelError("invalid_factor");
    }

    const nextPath = new Set(path);
    nextPath.add(unitId);
    const value = normalizeCalculatedFactor(
      edgeFactor * resolveFactor(anchorUnitId, nextPath),
      EFFECTIVE_INTEGER_DIGITS,
      EFFECTIVE_SCALE,
      "effective_factor_out_of_range",
    );
    memo[unitId] = value;
    return value;
  };

  const resolve = (unitId: number, path: ReadonlySet<number>): number => {
    validateDimensionPath(unitId, new Set(), null);
    return resolveFactor(unitId, path);
  };

  return { memo, resolve, selectedUnitIds };
}

function normalizeUnitRelations(
  input: UnitRelationInput | LegacyUnitRelationInput,
): UnitRelationInput {
  if (isGraphRelationInput(input)) return input;

  const unitsById = new Map(input.unitOptions.map((unit) => [unit.id, unit]));
  const baseUnit = unitsById.get(input.baseUnitId);
  const anchorUnitIds: Record<number, number | null> = {};
  const anchorFactors: Record<number, number | null> = {};

  for (const unitId of new Set(input.unitIds)) {
    if (unitId === input.baseUnitId) continue;
    const unit = unitsById.get(unitId);
    anchorUnitIds[unitId] = input.baseUnitId;
    anchorFactors[unitId] =
      unit != null &&
      baseUnit != null &&
      isAutomaticStandardRelation(unit, baseUnit)
        ? null
        : input.factors[unitId] ?? null;
  }

  return {
    unitIds: input.unitIds,
    baseUnitId: input.baseUnitId,
    anchorUnitIds,
    anchorFactors,
    unitOptions: input.unitOptions,
  };
}

function isGraphRelationInput(
  input: UnitRelationInput | LegacyUnitRelationInput,
): input is UnitRelationInput {
  return input.anchorUnitIds != null && input.anchorFactors != null;
}

function isAutomaticStandardRelation(unit: UnitOption, baseUnit: UnitOption): boolean {
  return (
    unit.is_standard &&
    baseUnit.is_standard &&
    unit.dimension != null &&
    unit.dimension === baseUnit.dimension
  );
}

function pathReachesUnit(
  anchorUnitIds: Readonly<Record<number, number | null>>,
  unitId: number,
  targetUnitId: number,
): boolean {
  const visited = new Set<number>();
  let currentUnitId: number | null = unitId;

  while (currentUnitId != null && !visited.has(currentUnitId)) {
    if (currentUnitId === targetUnitId) return true;
    visited.add(currentUnitId);
    currentUnitId = anchorUnitIds[currentUnitId] ?? null;
  }

  return false;
}

function isValidDatabaseNumeric(
  value: unknown,
  integerDigits: number,
  scale: number,
): boolean {
  if (typeof value !== "number" && typeof value !== "string") return false;
  const source = typeof value === "number" ? value.toString() : value.trim();
  if (source.length > 64) return false;
  const plain = toPlainPositiveDecimal(source);
  if (plain == null) return false;

  const [rawInteger = "", rawFraction = ""] = plain.split(".");
  const integer = rawInteger.replace(/^0+/, "");
  const fraction = rawFraction.replace(/0+$/, "");
  if (integer.length > integerDigits || fraction.length > scale) return false;

  const numeric = Number(plain);
  if (!Number.isFinite(numeric) || numeric <= 0) return false;
  if (numeric >= 10 ** integerDigits || numeric < 10 ** -scale) return false;

  // A decimal string can fit Postgres yet still round to another value in JSON.
  // Re-check the IEEE-754 representation so preview and persisted payload agree.
  if (typeof value === "string") {
    const represented = toPlainPositiveDecimal(numeric.toString());
    if (represented == null || represented !== normalizePlainDecimal(plain)) {
      return false;
    }
  }
  return true;
}

function normalizeCalculatedFactor(
  value: number,
  integerDigits: number,
  scale: number,
  errorCode:
    | "anchor_factor_out_of_range"
    | "effective_factor_out_of_range",
): number {
  const validator =
    scale === ANCHOR_SCALE ? isValidAnchorFactor : isValidEffectiveFactor;
  if (validator(value)) return value;
  if (!Number.isFinite(value) || value <= 0) {
    throw new IngredientUnitModelError(errorCode);
  }

  const rounded = Number(value.toFixed(scale));
  const floatingPointError =
    Number.EPSILON * Math.max(1, Math.abs(value)) * FLOATING_POINT_TOLERANCE;
  if (
    Math.abs(value - rounded) <= floatingPointError &&
    rounded < 10 ** integerDigits &&
    validator(rounded)
  ) {
    return rounded;
  }
  throw new IngredientUnitModelError(errorCode);
}

function toPlainPositiveDecimal(value: string): string | null {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) return null;
  const integer = match[1] ?? "";
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) return null;

  const digits = `${integer}${fraction}`;
  const decimalIndex = integer.length + exponent;
  if (decimalIndex <= 0) {
    return normalizePlainDecimal(`0.${"0".repeat(-decimalIndex)}${digits}`);
  }
  if (decimalIndex >= digits.length) {
    return normalizePlainDecimal(`${digits}${"0".repeat(decimalIndex - digits.length)}`);
  }
  return normalizePlainDecimal(
    `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`,
  );
}

function normalizePlainDecimal(value: string): string {
  const [rawInteger = "0", rawFraction = ""] = value.split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/, "") || "0";
  const fraction = rawFraction.replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

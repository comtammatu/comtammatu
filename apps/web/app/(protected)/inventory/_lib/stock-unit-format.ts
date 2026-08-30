import type { IngredientUnitRow } from "@lib/inventory/types";
import { formatQuantityUnitBreakdown } from "@lib/inventory/quantity-unit-format";

const QUANTITY_EPSILON = 5e-6;

function snapNearInteger(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= QUANTITY_EPSILON ? integer : value;
}

/** Whole packs toward zero so negative on-hand still decomposes cleanly. */
function wholeCount(qtyBase: number, factor: number): number {
  const raw = snapNearInteger(qtyBase / factor);
  if (qtyBase >= 0) {
    return Math.floor(raw + QUANTITY_EPSILON);
  }
  return Math.ceil(raw - QUANTITY_EPSILON);
}

function usableUnits(
  units: IngredientUnitRow[] | undefined,
): IngredientUnitRow[] {
  return (units ?? []).filter(
    (u) => u.is_active && u.unit_code.trim() !== "",
  );
}

/** Largest → smallest unique factors for packaging decomposition. */
function unitLadder(usable: IngredientUnitRow[]): IngredientUnitRow[] {
  const ladder: IngredientUnitRow[] = [];
  const seenFactors = new Set<number>();
  for (const unit of usable
    .filter((row) => Number(row.to_base_factor) > 0)
    .toSorted(
      (left, right) =>
        right.to_base_factor - left.to_base_factor ||
        left.sort_order - right.sort_order,
    )) {
    const factor = Number(unit.to_base_factor);
    if (seenFactors.has(factor)) continue;
    seenFactors.add(factor);
    ladder.push(unit);
  }
  return ladder;
}

export function resolveStockDisplayUnit(
  units: IngredientUnitRow[] | undefined,
): IngredientUnitRow | undefined {
  const usable = usableUnits(units);
  return (
    usable.find((u) => u.is_base) ??
    usable.reduce<IngredientUnitRow | undefined>(
      (smallest, unit) =>
        smallest === undefined || unit.to_base_factor < smallest.to_base_factor
          ? unit
          : smallest,
      undefined,
    )
  );
}

/**
 * Unit for operator-facing WAC / cost labels: the largest whole pack present
 * in the compact stock line, else the ledger standard unit.
 */
export function resolveStockCompactUnit(
  qtyBase: number,
  units: IngredientUnitRow[] | undefined,
): IngredientUnitRow | undefined {
  const usable = usableUnits(units);
  const displayRow = resolveStockDisplayUnit(usable);
  if (
    usable.length <= 1 ||
    !Number.isFinite(qtyBase) ||
    Math.abs(qtyBase) <= QUANTITY_EPSILON
  ) {
    return displayRow;
  }

  for (const unit of unitLadder(usable)) {
    if (Math.abs(wholeCount(qtyBase, Number(unit.to_base_factor))) >= 1) {
      return unit;
    }
  }
  return displayRow;
}

export function stockUnitLabel(
  unit: Pick<IngredientUnitRow, "unit_code" | "unit_name"> | null | undefined,
  fallback = "",
): string {
  return unit?.unit_name?.trim() || unit?.unit_code || fallback;
}

/** Convert ledger (base) quantity into the operator-facing display unit. */
export function toStockDisplayQuantity(
  qtyBase: number,
  displayUnit: Pick<IngredientUnitRow, "to_base_factor"> | null | undefined,
): number {
  const factor = Number(displayUnit?.to_base_factor ?? 1);
  if (!Number.isFinite(qtyBase) || !(factor > 0)) return qtyBase;
  return snapNearInteger(qtyBase / factor);
}

/** Convert ledger (base) WAC into the operator-facing display unit. */
export function toStockDisplayUnitCost(
  wacBase: number | null | undefined,
  displayUnit: Pick<IngredientUnitRow, "to_base_factor"> | null | undefined,
): number | null {
  if (wacBase == null) return null;
  const factor = Number(displayUnit?.to_base_factor ?? 1);
  if (!Number.isFinite(wacBase) || !(factor > 0)) return wacBase;
  return wacBase * factor;
}

/**
 * Compact stock quantity in the largest whole packs (max two tiers), with the
 * exact ledger-unit total kept as `base` for the secondary line.
 *
 * Examples (base = ml, lon = 250, thùng = 6000):
 * - 3750 → big "15 lon", base "3750 ml"
 * - 7500 → big "1 thùng + 6 lon", base "7500 ml"
 */
export function formatStockUnits(
  qtyBase: number,
  units: IngredientUnitRow[] | undefined,
  formatNumber: (n: number) => string,
): { big: string | null; base: string } {
  return formatQuantityUnitBreakdown(qtyBase, units, formatNumber);
}

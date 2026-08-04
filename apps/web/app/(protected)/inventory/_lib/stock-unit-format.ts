import type { IngredientUnitRow } from "@lib/inventory/types";

const QUANTITY_EPSILON = 5e-6;
/** Compact stock line shows at most two unit tiers (e.g. "1 thùng 6 lon"). */
const MAX_COMPACT_UNITS = 2;

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

function isNearInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) <= QUANTITY_EPSILON;
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
 * - 7500 → big "1 thùng 6 lon", base "7500 ml"
 */
export function formatStockUnits(
  qtyBase: number,
  units: IngredientUnitRow[] | undefined,
  formatNumber: (n: number) => string,
): { big: string | null; base: string } {
  const usable = usableUnits(units);

  const displayRow = resolveStockDisplayUnit(usable);
  const displayCode = displayRow?.unit_code ?? "";
  const displayFactor = Number(displayRow?.to_base_factor ?? 1);
  const displayQty = toStockDisplayQuantity(qtyBase, displayRow);
  const base = `${formatNumber(displayQty)} ${displayCode}`.trim();

  if (
    usable.length <= 1 ||
    !Number.isFinite(qtyBase) ||
    Math.abs(qtyBase) <= QUANTITY_EPSILON
  ) {
    return { big: null, base };
  }

  const ladder = unitLadder(usable);
  let remaining = snapNearInteger(qtyBase);
  const parts: Array<{ qty: number; code: string; factor: number }> = [];

  // Largest unit with at least one whole pack.
  for (const unit of ladder) {
    const factor = Number(unit.to_base_factor);
    const whole = wholeCount(remaining, factor);
    if (Math.abs(whole) < 1) continue;
    parts.push({ qty: whole, code: unit.unit_code, factor });
    remaining = snapNearInteger(remaining - whole * factor);
    break;
  }

  // Second tier: prefer an exact whole smaller pack; otherwise ledger unit.
  if (
    parts.length < MAX_COMPACT_UNITS &&
    Math.abs(remaining) > QUANTITY_EPSILON
  ) {
    const firstFactor = parts[0]?.factor ?? Number.POSITIVE_INFINITY;
    const smaller = ladder.filter(
      (unit) => Number(unit.to_base_factor) < firstFactor,
    );

    let placed = false;
    for (const unit of smaller) {
      const factor = Number(unit.to_base_factor);
      const asUnit = snapNearInteger(remaining / factor);
      if (Math.abs(asUnit) < 1 || !isNearInteger(asUnit)) continue;
      const leftover = snapNearInteger(remaining - asUnit * factor);
      if (Math.abs(leftover) > QUANTITY_EPSILON) continue;
      parts.push({ qty: asUnit, code: unit.unit_code, factor });
      remaining = 0;
      placed = true;
      break;
    }

    if (!placed && Math.abs(remaining) > QUANTITY_EPSILON) {
      const remDisplay = toStockDisplayQuantity(remaining, displayRow);
      if (Math.abs(remDisplay) > QUANTITY_EPSILON) {
        parts.push({
          qty: remDisplay,
          code: displayCode,
          factor: displayFactor,
        });
      }
    }
  }

  const displayParts = parts.slice(0, MAX_COMPACT_UNITS);
  if (displayParts.length === 0) {
    return { big: null, base };
  }

  const onlyLedgerUnit =
    displayParts.length === 1 &&
    displayParts[0]!.code === displayCode &&
    Math.abs(displayParts[0]!.qty - displayQty) <= QUANTITY_EPSILON;

  if (onlyLedgerUnit) {
    return { big: null, base };
  }

  return {
    big: displayParts
      .map((part) => `${formatNumber(part.qty)} ${part.code}`.trim())
      .join(" "),
    base,
  };
}

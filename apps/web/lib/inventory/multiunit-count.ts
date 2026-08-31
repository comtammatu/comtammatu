import { formatQty } from "./format";

const QUANTITY_EPSILON = 5e-6;

export interface CountUnitItem {
  unitId: number;
  code: string;
  label: string;
  isBase: boolean;
  toBaseFactor: number;
}

function snapNearInteger(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= QUANTITY_EPSILON ? integer : value;
}

/**
 * Returns active units sorted in descending order of toBaseFactor (largest packaging first).
 */
export function normalizeCountUnitLadder<T extends CountUnitItem>(
  units: readonly T[] | undefined,
): T[] {
  if (!units || units.length === 0) return [];
  const seenFactors = new Set<number>();
  const ladder: T[] = [];

  const sorted = [...units]
    .filter((u) => Number(u.toBaseFactor) > 0 && u.code.trim() !== "")
    .sort((a, b) => {
      if (b.toBaseFactor !== a.toBaseFactor) {
        return b.toBaseFactor - a.toBaseFactor;
      }
      return a.isBase ? 1 : -1;
    });

  for (const unit of sorted) {
    const factor = Number(unit.toBaseFactor);
    if (seenFactors.has(factor)) continue;
    seenFactors.add(factor);
    ladder.push(unit);
  }

  return ladder;
}

/**
 * Combine user-entered quantities across multiple units into a single total in base units.
 * Q_base = sum(unitValues[unitId] * toBaseFactor)
 */
export function combineMultiUnitQuantities(
  unitValues: Record<number, number | string | undefined | null>,
  unitLadder: readonly CountUnitItem[],
): number {
  let totalBase = 0;
  for (const unit of unitLadder) {
    const raw = unitValues[unit.unitId];
    if (raw === undefined || raw === null || raw === "") continue;
    const val = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (Number.isFinite(val) && val > 0) {
      totalBase += val * unit.toBaseFactor;
    }
  }
  return Math.round(snapNearInteger(totalBase) * 1000) / 1000;
}

/**
 * Decomposes a total base quantity into whole packaging units from largest to smallest.
 * E.g., for 33000 ml with Thùng (7920), Lon (330), ml (1):
 * returns { [thungId]: 4, [lonId]: 4, [mlId]: 0 }
 */
export function decomposeBaseQuantityToUnits(
  totalBaseQty: number,
  unitLadder: readonly CountUnitItem[],
): Record<number, number> {
  const result: Record<number, number> = {};
  if (!unitLadder || unitLadder.length === 0 || !Number.isFinite(totalBaseQty)) {
    return result;
  }

  const ladder = normalizeCountUnitLadder(unitLadder);
  if (ladder.length === 0) return result;

  let remaining = Math.max(0, snapNearInteger(totalBaseQty));

  for (let i = 0; i < ladder.length; i++) {
    const unit = ladder[i]!;
    const factor = Number(unit.toBaseFactor);

    if (i === ladder.length - 1) {
      // Smallest / base unit absorbs any leftover
      const val = Math.round(snapNearInteger(remaining / factor) * 1000) / 1000;
      result[unit.unitId] = val;
      remaining = 0;
    } else {
      const whole = Math.floor((remaining + QUANTITY_EPSILON) / factor);
      result[unit.unitId] = whole;
      remaining = snapNearInteger(remaining - whole * factor);
    }
  }

  return result;
}

/**
 * Normalizes user-entered unit values by calculating total base qty and re-decomposing.
 * E.g., inputs: 3 Thùng, 28 Lon (1 Thùng = 24 Lon) -> 4 Thùng, 4 Lon.
 * inputs: 0 Thùng, 24 Lon -> 1 Thùng, 0 Lon.
 */
export function normalizeEnteredUnitValues(
  unitValues: Record<number, number | string | undefined | null>,
  unitLadder: readonly CountUnitItem[],
): {
  totalBaseQty: number;
  normalizedValues: Record<number, number>;
  formattedBreakdown: string;
} {
  const ladder = normalizeCountUnitLadder(unitLadder);
  const totalBaseQty = combineMultiUnitQuantities(unitValues, ladder);
  const normalizedValues = decomposeBaseQuantityToUnits(totalBaseQty, ladder);
  const formattedBreakdown = formatMultiUnitBreakdown(totalBaseQty, ladder);

  return {
    totalBaseQty,
    normalizedValues,
    formattedBreakdown,
  };
}

/**
 * Formats a quantity in base units into a clean multi-unit string across the ladder.
 * E.g.: "4 Thùng + 4 Lon" or "1 Thùng" or "0 Lon"
 */
export function formatMultiUnitBreakdown(
  qtyBase: number | null | undefined,
  unitLadder: readonly CountUnitItem[] | undefined,
  options: {
    showBaseSecondary?: boolean;
    signed?: boolean;
    separator?: string;
    fallbackUnit?: string;
  } = {},
): string {
  if (qtyBase === null || qtyBase === undefined || !Number.isFinite(qtyBase)) {
    return "—";
  }

  const ladder = normalizeCountUnitLadder(unitLadder);
  const isNegative = qtyBase < -QUANTITY_EPSILON;
  const absQty = Math.abs(qtyBase);
  const signPrefix = options.signed && qtyBase > QUANTITY_EPSILON ? "+" : isNegative ? "−" : "";

  if (ladder.length === 0) {
    const unitText = options.fallbackUnit ? ` ${options.fallbackUnit}` : "";
    return `${signPrefix}${formatQty(absQty)}${unitText}`.trim();
  }

  const baseUnit = ladder.find((u) => u.isBase) ?? ladder[ladder.length - 1];
  const baseLabel = baseUnit?.label || baseUnit?.code || options.fallbackUnit || "";
  const baseCode = baseUnit?.code ?? options.fallbackUnit ?? "";

  if (absQty <= QUANTITY_EPSILON) {
    return `${signPrefix}0 ${baseLabel}`.trim();
  }

  const decomposed = decomposeBaseQuantityToUnits(absQty, ladder);
  const parts: string[] = [];

  for (const unit of ladder) {
    const val = decomposed[unit.unitId] ?? 0;
    if (val > 0) {
      parts.push(`${formatQty(val)} ${unit.label || unit.code}`);
    }
  }

  if (parts.length === 0) {
    return `${signPrefix}0 ${baseLabel}`.trim();
  }


  const mainBreakdown = `${signPrefix}${parts.join(options.separator ?? " + ")}`;

  if (options.showBaseSecondary && ladder.length > 1 && baseCode) {
    const baseFormatted = `${formatQty(absQty)} ${baseCode}`;
    // If the breakdown only contains the base unit anyway, don't repeat
    if (parts.length === 1 && parts[0]?.endsWith(baseCode)) {
      return mainBreakdown;
    }
    return `${mainBreakdown} (${signPrefix}${baseFormatted})`;
  }

  return mainBreakdown;
}

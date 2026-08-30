const QUANTITY_EPSILON = 5e-6;
const DEFAULT_MAX_UNITS = 2;

export type QuantityUnitFormatRow = {
  unit_code: string;
  to_base_factor: number;
  is_base: boolean;
  is_active: boolean;
  sort_order: number;
};

function snapNearInteger(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= QUANTITY_EPSILON ? integer : value;
}

function wholeCount(qtyBase: number, factor: number): number {
  const raw = snapNearInteger(qtyBase / factor);
  if (qtyBase >= 0) return Math.floor(raw + QUANTITY_EPSILON);
  return Math.ceil(raw - QUANTITY_EPSILON);
}

function isNearInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) <= QUANTITY_EPSILON;
}

function usableUnits<T extends QuantityUnitFormatRow>(
  units: readonly T[] | undefined,
): T[] {
  return (units ?? []).filter(
    (unit) =>
      unit.is_active &&
      unit.unit_code.trim() !== "" &&
      Number(unit.to_base_factor) > 0,
  );
}

function unitLadder<T extends QuantityUnitFormatRow>(units: readonly T[]): T[] {
  const ladder: T[] = [];
  const seenFactors = new Set<number>();
  for (const unit of units.toSorted(
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

function baseDisplayUnit<T extends QuantityUnitFormatRow>(
  units: readonly T[],
): T | undefined {
  return (
    units.find((unit) => unit.is_base) ??
    units.reduce<T | undefined>(
      (smallest, unit) =>
        smallest === undefined ||
        unit.to_base_factor < smallest.to_base_factor
          ? unit
          : smallest,
      undefined,
    )
  );
}

export function formatQuantityUnitBreakdown<T extends QuantityUnitFormatRow>(
  qtyBase: number,
  units: readonly T[] | undefined,
  formatNumber: (value: number) => string,
  options: { maxUnits?: number; separator?: string } = {},
): { big: string | null; base: string } {
  const usable = usableUnits(units);
  const displayUnit = baseDisplayUnit(usable);
  const displayCode = displayUnit?.unit_code ?? "";
  const displayFactor = Number(displayUnit?.to_base_factor ?? 1);
  const displayQuantity =
    Number.isFinite(qtyBase) && displayFactor > 0
      ? snapNearInteger(qtyBase / displayFactor)
      : qtyBase;
  const base = `${formatNumber(displayQuantity)} ${displayCode}`.trim();

  if (
    usable.length <= 1 ||
    !Number.isFinite(qtyBase) ||
    Math.abs(qtyBase) <= QUANTITY_EPSILON
  ) {
    return { big: null, base };
  }

  const maxUnits = Math.max(1, options.maxUnits ?? DEFAULT_MAX_UNITS);
  const ladder = unitLadder(usable);
  let remaining = snapNearInteger(qtyBase);
  const parts: Array<{ qty: number; code: string; factor: number }> = [];

  for (const unit of ladder) {
    const factor = Number(unit.to_base_factor);
    const whole = wholeCount(remaining, factor);
    if (Math.abs(whole) < 1) continue;
    parts.push({ qty: whole, code: unit.unit_code, factor });
    remaining = snapNearInteger(remaining - whole * factor);
    break;
  }

  if (parts.length < maxUnits && Math.abs(remaining) > QUANTITY_EPSILON) {
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
      const remainderQuantity = snapNearInteger(remaining / displayFactor);
      if (Math.abs(remainderQuantity) > QUANTITY_EPSILON) {
        parts.push({
          qty: remainderQuantity,
          code: displayCode,
          factor: displayFactor,
        });
      }
    }
  }

  const displayParts = parts.slice(0, maxUnits);
  if (displayParts.length === 0) return { big: null, base };

  const onlyBaseUnit =
    displayParts.length === 1 &&
    displayParts[0]!.code === displayCode &&
    Math.abs(displayParts[0]!.qty - displayQuantity) <= QUANTITY_EPSILON;
  if (onlyBaseUnit) return { big: null, base };

  return {
    big: displayParts
      .map((part) => `${formatNumber(part.qty)} ${part.code}`.trim())
      .join(options.separator ?? " + "),
    base,
  };
}

export function formatQuantityInLargestUnits<T extends QuantityUnitFormatRow>(
  qtyBase: number,
  units: readonly T[] | undefined,
  formatNumber: (value: number) => string,
): string {
  const sign = qtyBase < -QUANTITY_EPSILON ? "−" : "";
  const { big, base } = formatQuantityUnitBreakdown(
    Math.abs(qtyBase),
    units,
    formatNumber,
    { separator: " " },
  );
  return `${sign}${big ?? base}`;
}

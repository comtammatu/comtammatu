import type { IngredientUnitRow } from "@lib/inventory/types";

const QUANTITY_EPSILON = 5e-6;

function snapNearInteger(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= QUANTITY_EPSILON ? integer : value;
}

/**
 * Two-line stock quantity: mixed packaging on top when whole larger units
 * exist (`2 thùng + 30 ml`), exact base-unit total below. Below one largest
 * pack, only the base line is shown.
 */
export function formatStockUnits(
  qtyBase: number,
  units: IngredientUnitRow[] | undefined,
  formatNumber: (n: number) => string,
): { big: string | null; base: string } {
  const usable = (units ?? []).filter(
    (u) => u.is_active && u.unit_code.trim() !== "",
  );

  const baseRow =
    usable.find((u) => u.is_base) ??
    usable.reduce<IngredientUnitRow | undefined>(
      (smallest, unit) =>
        smallest === undefined || unit.to_base_factor < smallest.to_base_factor
          ? unit
          : smallest,
      undefined,
    );
  const baseCode = baseRow?.unit_code ?? "";
  const base = `${formatNumber(qtyBase)} ${baseCode}`.trim();

  if (usable.length <= 1 || !Number.isFinite(qtyBase) || qtyBase <= 0) {
    return { big: null, base };
  }

  const ladder = usable
    .filter((unit) => unit.to_base_factor > 1)
    .toSorted((left, right) => right.to_base_factor - left.to_base_factor);

  if (ladder.length === 0) {
    return { big: null, base };
  }

  let remaining = snapNearInteger(qtyBase);
  const parts: string[] = [];
  let hasPackagingPart = false;

  for (const unit of ladder) {
    const factor = unit.to_base_factor;
    if (!(factor > 1)) continue;
    const whole = Math.floor(
      snapNearInteger(remaining / factor) + QUANTITY_EPSILON,
    );
    if (whole > 0) {
      parts.push(`${formatNumber(whole)} ${unit.unit_code}`);
      remaining = snapNearInteger(remaining - whole * factor);
      hasPackagingPart = true;
    }
  }

  if (remaining > QUANTITY_EPSILON) {
    parts.push(`${formatNumber(remaining)} ${baseCode}`.trim());
  }

  // No whole larger pack: operators see base only (not "0 thùng + 125 ml").
  if (!hasPackagingPart) {
    return { big: null, base };
  }

  return {
    big: parts.join(" + "),
    base,
  };
}

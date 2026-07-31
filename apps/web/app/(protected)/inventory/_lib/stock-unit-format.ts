import type { IngredientUnitRow } from "@lib/inventory/types";

const QUANTITY_EPSILON = 5e-6;

function snapNearInteger(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= QUANTITY_EPSILON ? integer : value;
}

export function resolveStockDisplayUnit(
  units: IngredientUnitRow[] | undefined,
  preferredUnitId?: number | null,
): IngredientUnitRow | undefined {
  const usable = (units ?? []).filter(
    (u) => u.is_active && u.unit_code.trim() !== "",
  );
  if (preferredUnitId != null) {
    const preferred = usable.find((unit) => unit.unit_id === preferredUnitId);
    if (preferred) return preferred;
  }
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
 * Two-line stock quantity: mixed packaging on top when whole larger units
 * exist (`2 thùng + 30 chai`), exact display-unit total below. Display unit
 * defaults to issue/export when preferredUnitId is provided; otherwise is_base.
 */
export function formatStockUnits(
  qtyBase: number,
  units: IngredientUnitRow[] | undefined,
  formatNumber: (n: number) => string,
  options?: { preferredUnitId?: number | null },
): { big: string | null; base: string } {
  const usable = (units ?? []).filter(
    (u) => u.is_active && u.unit_code.trim() !== "",
  );

  const displayRow = resolveStockDisplayUnit(
    usable,
    options?.preferredUnitId,
  );
  const displayCode = displayRow?.unit_code ?? "";
  const displayFactor = Number(displayRow?.to_base_factor ?? 1);
  const displayQty = toStockDisplayQuantity(qtyBase, displayRow);
  const base = `${formatNumber(displayQty)} ${displayCode}`.trim();

  if (usable.length <= 1 || !Number.isFinite(qtyBase) || qtyBase <= 0) {
    return { big: null, base };
  }

  const ladder = usable
    .filter((unit) => unit.to_base_factor > displayFactor)
    .toSorted((left, right) => right.to_base_factor - left.to_base_factor);

  if (ladder.length === 0) {
    return { big: null, base };
  }

  let remaining = snapNearInteger(qtyBase);
  const parts: string[] = [];
  let hasPackagingPart = false;

  for (const unit of ladder) {
    const factor = unit.to_base_factor;
    if (!(factor > displayFactor)) continue;
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
    const remainderDisplay = toStockDisplayQuantity(remaining, displayRow);
    parts.push(`${formatNumber(remainderDisplay)} ${displayCode}`.trim());
  }

  // No whole larger pack: operators see display unit only.
  if (!hasPackagingPart) {
    return { big: null, base };
  }

  return {
    big: parts.join(" + "),
    base,
  };
}

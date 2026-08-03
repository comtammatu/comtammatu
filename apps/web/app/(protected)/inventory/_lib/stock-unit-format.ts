import type { IngredientUnitRow } from "@lib/inventory/types";

const QUANTITY_EPSILON = 5e-6;

function snapNearInteger(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= QUANTITY_EPSILON ? integer : value;
}

export function resolveStockDisplayUnit(
  units: IngredientUnitRow[] | undefined,
): IngredientUnitRow | undefined {
  const usable = (units ?? []).filter(
    (u) => u.is_active && u.unit_code.trim() !== "",
  );
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
 * Stock quantity is always displayed in the ledger's standard unit.
 */
export function formatStockUnits(
  qtyBase: number,
  units: IngredientUnitRow[] | undefined,
  formatNumber: (n: number) => string,
): { big: string | null; base: string } {
  const usable = (units ?? []).filter(
    (u) => u.is_active && u.unit_code.trim() !== "",
  );

  const displayRow = resolveStockDisplayUnit(usable);
  const displayCode = displayRow?.unit_code ?? "";
  const displayQty = toStockDisplayQuantity(qtyBase, displayRow);
  const base = `${formatNumber(displayQty)} ${displayCode}`.trim();

  return { big: null, base };
}

import type { IngredientUnitRow } from "@lib/inventory/types";

// Show the configured largest-unit conversion and the exact base-unit total.
export function formatStockUnits(
  qtyBase: number,
  units: IngredientUnitRow[] | undefined,
  formatNumber: (n: number) => string,
): { big: string | null; base: string } {
  const usable = (units ?? []).filter(
    (u) => u.is_active && u.unit_code.trim() !== "",
  );

  const baseRow = usable.find((u) => u.is_base) ?? usable[0];
  const baseCode = baseRow?.unit_code ?? "";
  const base = `${formatNumber(qtyBase)} ${baseCode}`.trim();

  const biggest = usable.reduce<IngredientUnitRow | undefined>(
    (current, unit) =>
      current === undefined || unit.to_base_factor > current.to_base_factor
        ? unit
        : current,
    undefined,
  );
  if (
    usable.length <= 1 ||
    biggest === undefined ||
    biggest.to_base_factor <= 1
  ) {
    return { big: null, base };
  }

  return {
    big: `${formatNumber(qtyBase / biggest.to_base_factor)} ${biggest.unit_code}`,
    base,
  };
}

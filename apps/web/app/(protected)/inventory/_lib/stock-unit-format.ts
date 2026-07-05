import type { IngredientUnitRow } from "./types";

// Two-line view of a base-unit stock quantity: a whole-count step breakdown
// across every unit rung (biggest -> smallest, skipping zero levels) on top,
// and the exact total in the base unit below. `big` is null when the ingredient
// has a single unit (only the base) so callers render one line.
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

  // Ladder biggest -> smallest; the base unit (to_base 1) is the last rung.
  const ladder = [...usable].sort(
    (a, b) => b.to_base_factor - a.to_base_factor,
  );
  const biggest = ladder[0];

  if (ladder.length <= 1 || biggest === undefined || biggest.to_base_factor <= 1) {
    return { big: null, base };
  }

  let remaining = qtyBase;
  const parts: string[] = [];
  for (const u of ladder) {
    const whole = Math.floor(remaining / u.to_base_factor + 1e-9);
    if (whole > 0) {
      parts.push(`${formatNumber(whole)} ${u.unit_code}`);
      remaining -= whole * u.to_base_factor;
    }
  }

  return { big: parts.length ? parts.join(" ") : null, base };
}

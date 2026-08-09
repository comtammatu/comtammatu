/**
 * Suggested editable order quantity (INV-10).
 * Canonical: docs/ref/inventory.md §9 — max(0, min_stock_level - current).
 * max_stock_level / reorder_point are retired UI columns and must not drive this.
 */

export function suggestedOrderQtyBase(
  minStockLevel: number | null | undefined,
  currentQuantity: number,
): number {
  if (minStockLevel == null || !(minStockLevel > 0)) return 0;
  if (!Number.isFinite(currentQuantity)) return 0;
  return Math.max(0, minStockLevel - currentQuantity);
}

/** Convert a base-unit suggestion into an entry-unit quantity (editable). */
export function suggestedOrderQtyInEntryUnit(
  suggestedBase: number,
  toBaseFactor: number,
): number {
  if (!(suggestedBase > 0)) return 0;
  if (!(toBaseFactor > 0)) return suggestedBase;
  if (toBaseFactor === 1) return suggestedBase;
  return Math.ceil((suggestedBase / toBaseFactor) * 1000) / 1000;
}

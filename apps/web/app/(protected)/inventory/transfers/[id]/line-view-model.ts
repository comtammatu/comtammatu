export type TransferLineTotalInput = {
  /** Entry-unit quantity recorded on the transfer line (`stock_transfer_items.quantity`). */
  entryQuantity: number;
  /** Per-base-unit WAC cost set by `stock_transfer_confirm_ship` (`unit_cost_at_ship`). */
  baseUnitCost: number;
  /** `stock_transfer_items.entry_unit_id`; NULL means the entry unit already is the base unit. */
  entryUnitId: number | null;
  /** `ingredient_units.to_base_factor` for `(ingredient_id, entryUnitId)`; NULL when unresolved. */
  toBaseFactor: number | null;
};

/**
 * Multi-unit-safe line total: converts the entry-unit quantity to base-unit
 * quantity before multiplying by the base-unit WAC cost. Mirrors the
 * conversion `stock_transfer_confirm_ship` performs via `inv_to_base()`.
 */
export function computeTransferLineTotal(input: TransferLineTotalInput): {
  baseQuantity: number;
  total: number;
} {
  const factor =
    input.entryUnitId === null || !Number.isFinite(input.toBaseFactor ?? NaN)
      ? 1
      : (input.toBaseFactor as number);
  const baseQuantity = input.entryQuantity * factor;
  return { baseQuantity, total: baseQuantity * input.baseUnitCost };
}

/** Per-entry-unit WAC so the unit cost label matches the quantity unit. */
export function computeTransferLineDisplayUnitCost(input: {
  baseUnitCost: number;
  toBaseFactor: number | null;
}): number {
  const factor =
    input.toBaseFactor != null &&
    Number.isFinite(input.toBaseFactor) &&
    input.toBaseFactor > 0
      ? input.toBaseFactor
      : 1;
  return input.baseUnitCost * factor;
}

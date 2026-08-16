type QuantityValue = number | null | undefined;

/**
 * Side quantity is stored per main-item portion. Labels must never multiply
 * by parent quantity — use sideTotalQuantity (print-render) only for bill SL.
 */
export function sidePortionQuantity(value: QuantityValue): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 1;
}

/** Portion count prefix: `4x` means four main portions. */
export function formatPortionQuantity(quantity: QuantityValue): string {
  return `${String(sidePortionQuantity(quantity))}x`;
}

/**
 * Side label with per-portion suffix: only shows `xN` when quantity > 1.
 * When quantity is 1 (or omitted), returns the clean side item name.
 */
export function formatSidePortionLabel(
  name: string,
  quantityPerPortion?: QuantityValue,
): string {
  const qty = sidePortionQuantity(quantityPerPortion);
  if (qty <= 1) {
    return name;
  }
  return `${name} x${String(qty)}`;
}


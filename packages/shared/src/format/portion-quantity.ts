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
 * Side label with per-portion suffix: `Trứng x1` means one egg on each
 * portion, never a line total.
 */
export function formatSidePortionLabel(
  name: string,
  quantityPerPortion?: QuantityValue,
): string {
  return `${name} x${String(sidePortionQuantity(quantityPerPortion))}`;
}

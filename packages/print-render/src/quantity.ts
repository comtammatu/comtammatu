type QuantityValue = number | null | undefined;

function positiveQuantity(value: QuantityValue, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

/**
 * Side quantity is stored per main item unit. A side present without an
 * explicit quantity still means one side for each parent item.
 */
export function sideTotalQuantity(
  sideQuantity: QuantityValue,
  parentQuantity: QuantityValue,
): number {
  return (
    positiveQuantity(sideQuantity, 1) * positiveQuantity(parentQuantity, 0)
  );
}

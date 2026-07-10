function isPositiveFinite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

export function productionQuantityToBase(
  quantity: number,
  toBaseFactor: number | null | undefined,
): number | null {
  if (!Number.isFinite(quantity) || !isPositiveFinite(toBaseFactor)) {
    return null;
  }

  return quantity * toBaseFactor;
}

export function productionQuantityFromBase(
  baseQuantity: number,
  toBaseFactor: number | null | undefined,
): number | null {
  if (!Number.isFinite(baseQuantity) || !isPositiveFinite(toBaseFactor)) {
    return null;
  }

  return baseQuantity / toBaseFactor;
}

/**
 * Purchase-demand progress in the demand line's entry unit.
 * PO lines may use receipt units; convert via base factors before compare.
 */
export function purchaseDemandLineProgress(input: {
  demandQuantity: number;
  demandToBaseFactor: number;
  orderedLines: ReadonlyArray<{
    quantity: number;
    entryToBaseFactor: number;
  }>;
}): { orderedQuantity: number; remainingQuantity: number } {
  const demandFactor = input.demandToBaseFactor;
  if (!(demandFactor > 0)) {
    return {
      orderedQuantity: 0,
      remainingQuantity: Math.max(input.demandQuantity, 0),
    };
  }

  let orderedBase = 0;
  for (const line of input.orderedLines) {
    if (!(line.entryToBaseFactor > 0)) continue;
    orderedBase += line.quantity * line.entryToBaseFactor;
  }

  const orderedQuantity =
    Math.round((orderedBase / demandFactor) * 1000) / 1000;
  const remainingQuantity = Math.max(
    Math.round((input.demandQuantity - orderedQuantity) * 1000) / 1000,
    0,
  );

  return { orderedQuantity, remainingQuantity };
}

export type PurchaseOrderSupplier = {
  id: number;
  name: string;
  ingredientIds: number[];
  preferredIngredientIds: number[];
};

export type PurchaseOrderDraftLine = {
  key: string;
  requestItemId: number;
  quantity: string;
};

export type PurchaseOrderDraft = {
  supplierId: number;
  supplierName: string;
  lines: PurchaseOrderDraftLine[];
};

type RequestItem = {
  id: number;
  ingredientId: number;
  remainingQuantity: number;
};

export type PurchaseDemandAllocation = {
  requestItemId: number;
  supplierId: number;
  quantity: number;
};

export function buildAutomaticPurchaseDemandAllocations(
  items: readonly RequestItem[],
  suppliers: readonly PurchaseOrderSupplier[],
): PurchaseDemandAllocation[] | null {
  const allocations: PurchaseDemandAllocation[] = [];

  for (const item of items) {
    if (item.remainingQuantity <= 0) continue;
    const matches = suppliers.filter((supplier) =>
      supplier.ingredientIds.includes(item.ingredientId),
    );
    if (matches.length !== 1) return null;
    allocations.push({
      requestItemId: item.id,
      supplierId: matches[0]!.id,
      quantity: item.remainingQuantity,
    });
  }

  return allocations.length > 0 ? allocations : null;
}

export function findUnassignedPurchaseRequestItemIds(
  items: readonly RequestItem[],
  suppliers: readonly PurchaseOrderSupplier[],
): number[] {
  const assignedIngredientIds = new Set(
    suppliers.flatMap((supplier) => supplier.ingredientIds),
  );
  return items
    .filter(
      (item) =>
        item.remainingQuantity > 0 &&
        !assignedIngredientIds.has(item.ingredientId),
    )
    .map((item) => item.id);
}

export function buildPurchaseOrderDrafts(
  items: readonly RequestItem[],
  suppliers: readonly PurchaseOrderSupplier[],
  allocations: ReadonlyArray<{
    requestItemId: number;
    supplierId: number;
    quantity: number;
  }> = [],
): PurchaseOrderDraft[] {
  const saved = new Map(
    allocations.map((allocation) => [
      `${allocation.supplierId}:${allocation.requestItemId}`,
      allocation.quantity,
    ]),
  );
  const orderedSuppliers = [...suppliers].sort(
    (left, right) =>
      Number(right.preferredIngredientIds.length > 0) -
        Number(left.preferredIngredientIds.length > 0) ||
      left.name.localeCompare(right.name, "vi"),
  );

  return orderedSuppliers.flatMap((supplier) => {
    const lines = items
      .filter(
        (item) =>
          item.remainingQuantity > 0 &&
          supplier.ingredientIds.includes(item.ingredientId),
      )
      .map(
        (item): PurchaseOrderDraftLine => ({
          key: `${supplier.id}:${item.id}`,
          requestItemId: item.id,
          quantity: String(saved.get(`${supplier.id}:${item.id}`) ?? ""),
        }),
      );

    return lines.length > 0
      ? [{ supplierId: supplier.id, supplierName: supplier.name, lines }]
      : [];
  });
}

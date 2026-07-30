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
  unitPrice: string;
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
): PurchaseOrderDraft[] {
  const candidatesByIngredient = new Map<number, number[]>();
  const preferredByIngredient = new Map<number, number[]>();

  for (const supplier of suppliers) {
    for (const ingredientId of supplier.ingredientIds) {
      candidatesByIngredient.set(ingredientId, [
        ...(candidatesByIngredient.get(ingredientId) ?? []),
        supplier.id,
      ]);
    }
    for (const ingredientId of supplier.preferredIngredientIds) {
      preferredByIngredient.set(ingredientId, [
        ...(preferredByIngredient.get(ingredientId) ?? []),
        supplier.id,
      ]);
    }
  }

  return suppliers.flatMap((supplier) => {
    const lines = items
      .filter(
        (item) =>
          item.remainingQuantity > 0 &&
          supplier.ingredientIds.includes(item.ingredientId),
      )
      .map((item): PurchaseOrderDraftLine => {
        const candidates = candidatesByIngredient.get(item.ingredientId) ?? [];
        const preferred = preferredByIngredient.get(item.ingredientId) ?? [];
        const defaultSupplierId =
          preferred.length === 1
            ? preferred[0]
            : candidates.length === 1
              ? candidates[0]
              : null;

        return {
          key: `${supplier.id}:${item.id}`,
          requestItemId: item.id,
          quantity:
            supplier.id === defaultSupplierId
              ? String(item.remainingQuantity)
              : "",
          unitPrice: "",
        };
      });

    return lines.length > 0
      ? [{ supplierId: supplier.id, supplierName: supplier.name, lines }]
      : [];
  });
}

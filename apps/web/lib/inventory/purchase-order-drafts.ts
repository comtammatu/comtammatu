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
  supplierId: number | null;
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

export function matchingSuppliersForIngredient(
  ingredientId: number,
  suppliers: readonly PurchaseOrderSupplier[],
): PurchaseOrderSupplier[] {
  return suppliers
    .filter((supplier) => supplier.ingredientIds.includes(ingredientId))
    .sort((left, right) => left.name.localeCompare(right.name, "vi"));
}

export function pickDefaultPurchaseDemandSupplier(
  ingredientId: number,
  suppliers: readonly PurchaseOrderSupplier[],
): PurchaseOrderSupplier | null {
  const matches = matchingSuppliersForIngredient(ingredientId, suppliers);
  const preferred = matches.find((supplier) =>
    supplier.preferredIngredientIds.includes(ingredientId),
  );
  if (preferred) return preferred;
  if (matches.length === 1) return matches[0] ?? null;
  return null;
}

export function buildAutomaticPurchaseDemandAllocations(
  items: readonly RequestItem[],
  suppliers: readonly PurchaseOrderSupplier[],
): PurchaseDemandAllocation[] | null {
  const allocations: PurchaseDemandAllocation[] = [];

  for (const item of items) {
    if (item.remainingQuantity <= 0) continue;
    const matches = matchingSuppliersForIngredient(
      item.ingredientId,
      suppliers,
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

function allocationLineKey(
  supplierId: number | null,
  requestItemId: number,
  salt = "",
): string {
  if (supplierId == null) {
    return salt
      ? `unassigned:${requestItemId}:${salt}`
      : `unassigned:${requestItemId}`;
  }
  return `${supplierId}:${requestItemId}`;
}

function appendDraftLine(
  drafts: PurchaseOrderDraft[],
  supplier: PurchaseOrderSupplier | null,
  line: PurchaseOrderDraftLine,
): void {
  const supplierId = supplier?.id ?? null;
  const existing = drafts.find((draft) => draft.supplierId === supplierId);
  if (existing) {
    existing.lines.push(line);
    return;
  }
  drafts.push({
    supplierId,
    supplierName: supplier?.name ?? "",
    lines: [line],
  });
}

function rowCountForItem(
  drafts: readonly PurchaseOrderDraft[],
  requestItemId: number,
): number {
  return drafts.reduce(
    (count, draft) =>
      count +
      draft.lines.filter((line) => line.requestItemId === requestItemId).length,
    0,
  );
}

export function canAddPurchaseDemandAllocationRow(
  drafts: readonly PurchaseOrderDraft[],
  requestItemId: number,
  ingredientId: number,
  suppliers: readonly PurchaseOrderSupplier[],
): boolean {
  const mapped = matchingSuppliersForIngredient(ingredientId, suppliers);
  if (mapped.length <= 1) return false;
  return rowCountForItem(drafts, requestItemId) < mapped.length;
}

export function addPurchaseDemandAllocationRow(
  drafts: readonly PurchaseOrderDraft[],
  requestItemId: number,
  ingredientId: number,
  suppliers: readonly PurchaseOrderSupplier[],
): PurchaseOrderDraft[] {
  if (
    !canAddPurchaseDemandAllocationRow(
      drafts,
      requestItemId,
      ingredientId,
      suppliers,
    )
  ) {
    return [...drafts];
  }

  const line: PurchaseOrderDraftLine = {
    key: allocationLineKey(null, requestItemId, crypto.randomUUID()),
    requestItemId,
    quantity: "",
  };
  const next = drafts.map((draft) => ({
    ...draft,
    lines: [...draft.lines],
  }));
  appendDraftLine(next, null, line);
  return next;
}

export function removePurchaseDemandAllocationRow(
  drafts: readonly PurchaseOrderDraft[],
  supplierId: number | null,
  lineKey: string,
): PurchaseOrderDraft[] {
  return drafts
    .map((draft) =>
      draft.supplierId === supplierId
        ? {
            ...draft,
            lines: draft.lines.filter((line) => line.key !== lineKey),
          }
        : draft,
    )
    .filter((draft) => draft.lines.length > 0);
}

export function reassignPurchaseDemandAllocationSupplier(
  drafts: readonly PurchaseOrderDraft[],
  fromSupplierId: number | null,
  lineKey: string,
  toSupplierId: number | null,
  suppliers: readonly PurchaseOrderSupplier[],
): PurchaseOrderDraft[] {
  if (fromSupplierId === toSupplierId) return [...drafts];

  const source = drafts.find((draft) => draft.supplierId === fromSupplierId);
  const line = source?.lines.find((entry) => entry.key === lineKey);
  if (!line) return [...drafts];

  const alreadyUsed = drafts.some(
    (draft) =>
      draft.supplierId === toSupplierId &&
      draft.supplierId != null &&
      draft.lines.some((entry) => entry.requestItemId === line.requestItemId),
  );
  if (alreadyUsed) return [...drafts];

  const supplier =
    toSupplierId == null
      ? null
      : (suppliers.find((entry) => entry.id === toSupplierId) ?? null);
  if (toSupplierId != null && supplier == null) return [...drafts];

  const nextLine: PurchaseOrderDraftLine = {
    ...line,
    key: allocationLineKey(
      toSupplierId,
      line.requestItemId,
      toSupplierId == null ? crypto.randomUUID() : "",
    ),
  };

  const withoutLine = removePurchaseDemandAllocationRow(
    drafts,
    fromSupplierId,
    lineKey,
  );
  const next = withoutLine.map((draft) => ({
    ...draft,
    lines: [...draft.lines],
  }));
  appendDraftLine(next, supplier, nextLine);
  return next;
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
  const savedByItem = new Map<
    number,
    Array<{ requestItemId: number; supplierId: number; quantity: number }>
  >();
  for (const allocation of allocations) {
    if (allocation.quantity <= 0) continue;
    const list = savedByItem.get(allocation.requestItemId) ?? [];
    list.push(allocation);
    savedByItem.set(allocation.requestItemId, list);
  }

  const drafts: PurchaseOrderDraft[] = [];

  for (const item of items) {
    if (item.remainingQuantity <= 0) continue;
    const mapped = matchingSuppliersForIngredient(item.ingredientId, suppliers);
    if (mapped.length === 0) continue;

    const saved = savedByItem.get(item.id) ?? [];
    const restored = saved.flatMap((allocation) => {
      const supplier = mapped.find((entry) => entry.id === allocation.supplierId);
      return supplier
        ? [
            {
              supplier,
              quantity: String(allocation.quantity),
            },
          ]
        : [];
    });

    if (restored.length > 0) {
      for (const row of restored) {
        appendDraftLine(drafts, row.supplier, {
          key: allocationLineKey(row.supplier.id, item.id),
          requestItemId: item.id,
          quantity: row.quantity,
        });
      }
      continue;
    }

    const defaultSupplier = pickDefaultPurchaseDemandSupplier(
      item.ingredientId,
      suppliers,
    );
    appendDraftLine(drafts, defaultSupplier, {
      key: allocationLineKey(defaultSupplier?.id ?? null, item.id),
      requestItemId: item.id,
      quantity: String(item.remainingQuantity),
    });
  }

  return drafts;
}

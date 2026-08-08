export type PurchaseRequestItemRow = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  orderedQuantity: number;
  remainingQuantity: number;
  entryUnitId: number;
  unitLabel: string;
  notes: string | null;
};

export type PurchaseRequestRow = {
  id: number;
  code: string;
  branchId: number;
  branchName: string;
  status: string;
  statusReason: string | null;
  neededBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  orderedLineCount: number;
  items: PurchaseRequestItemRow[];
  allocations: Array<{
    requestItemId: number;
    supplierId: number;
    quantity: number;
  }>;
  purchaseOrders: Array<{
    id: number;
    code: string;
    status: string;
    supplierName: string;
  }>;
};

export type PurchaseRequestIngredientOption = {
  id: number;
  name: string;
  units: Array<{ id: number; label: string; factor: number }>;
};

export function purchaseRequestStatusVariant(status: string) {
  if (status === "ordered") return "success" as const;
  if (
    status === "pending_allocation" ||
    status === "partially_ordered" ||
    status === "changes_requested"
  ) {
    return "warning" as const;
  }
  if (status === "cancelled") return "destructive" as const;
  return "secondary" as const;
}

export function defaultPurchaseRequestUnit(
  ingredient?: PurchaseRequestIngredientOption,
) {
  return ingredient?.units.reduce<
    PurchaseRequestIngredientOption["units"][number] | undefined
  >(
    (selected, unit) =>
      selected == null || unit.factor > selected.factor ? unit : selected,
    undefined,
  );
}

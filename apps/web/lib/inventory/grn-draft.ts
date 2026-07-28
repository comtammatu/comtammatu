export type GrnDraftLine = {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  // Purchase-role unit the qty was entered in. NULL = free-text/base unit.
  entryUnitId?: number | null;
  quantity: number;
};

export type GrnDraft = {
  draftId: string;
  supplierId: number;
  supplierName: string;
  branchId: number | null;
  lines: GrnDraftLine[];
  updatedAt: string;
};

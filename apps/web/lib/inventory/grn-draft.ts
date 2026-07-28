export type GrnDraftLine = {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  // Purchase-role unit the qty was entered in. NULL = free-text/base unit.
  entryUnitId?: number | null;
  quantity: number;
  supplierId: number;
  supplierName: string;
};

export type GrnDraft = {
  draftId: string;
  /** Null for multi-supplier drafts created without a header supplier. */
  supplierId: number | null;
  supplierName: string | null;
  branchId: number | null;
  lines: GrnDraftLine[];
  updatedAt: string;
};

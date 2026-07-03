export type GrnDraftLine = {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  // Purchase-role unit the qty was entered in. NULL = free-text/base unit.
  entryUnitId?: number | null;
  quantity: number;
  unitCost: number;
  note?: string;
};

export type GrnDraft = {
  draftId: string;
  supplierId: number;
  supplierName: string;
  branchId: number | null;
  lines: GrnDraftLine[];
  updatedAt: string;
};

/** Sum line totals (qty x unit cost). Pure helper; safe in client + server. */
export function draftTotal(draft: GrnDraft | null): number {
  if (!draft) return 0;
  return draft.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitCost,
    0,
  );
}

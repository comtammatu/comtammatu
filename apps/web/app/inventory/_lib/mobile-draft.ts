// Sprint 6 #3: localStorage-backed draft helpers retired in favor of
// server-side `goods_received_notes status='draft'` lifecycle. This file
// now exports types + pure helpers only — every storage path lives on the
// server (see `loadActiveGrnDraft`, `discardGrnDraft`, `listMyGrnDrafts`,
// `createGrnDraft`, `upsertGrnLine`, `deleteGrnLine` in `grn-actions.ts`).

export type GrnDraftLine = {
  ingredientId: number;
  ingredientName: string;
  unit: string;
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

/** Sum line totals (qty × unit cost). Pure helper; safe in client + server. */
export function draftTotal(draft: GrnDraft | null): number {
  if (!draft) return 0;
  return draft.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitCost,
    0,
  );
}

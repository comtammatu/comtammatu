import type { GrnDraftLine } from "./grn-draft";

export type PersistableGrnDraftLine = GrnDraftLine & {
  lineId?: number;
};

type UpsertGrnDraftLineInput = {
  grnId: number;
  ingredientId: number;
  supplierId: number;
  receivedQuantity: number;
  entryUnitId: number | null;
};

type UpsertGrnDraftLineResult = {
  success: boolean;
  data?: { id: number };
  error?: string;
};

export async function persistPendingGrnDraftLines(
  grnId: number,
  lines: readonly PersistableGrnDraftLine[],
  upsertLine: (
    input: UpsertGrnDraftLineInput,
  ) => Promise<UpsertGrnDraftLineResult>,
): Promise<
  | { success: true; lines: PersistableGrnDraftLine[] }
  | { success: false; error?: string }
> {
  const persistedLines: PersistableGrnDraftLine[] = [];

  for (const line of lines) {
    if (line.lineId) {
      persistedLines.push(line);
      continue;
    }

    const result = await upsertLine({
      grnId,
      ingredientId: line.ingredientId,
      supplierId: line.supplierId,
      receivedQuantity: line.quantity,
      entryUnitId: line.entryUnitId ?? null,
    });
    if (!result.success || !result.data?.id) {
      return { success: false, error: result.error };
    }

    persistedLines.push({ ...line, lineId: result.data.id });
  }

  return { success: true, lines: persistedLines };
}

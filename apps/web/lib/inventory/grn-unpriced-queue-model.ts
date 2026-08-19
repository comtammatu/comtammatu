import { z } from "zod";
import type { GrnDetail, GrnDetailItem } from "./grn-detail-model";

export const OWNER_UNPRICED_GRN_STATUS = "awaiting_unit_price" as const;

export type ConfirmedGrnUnitOption = {
  unitId: number;
  label: string;
};

export type UnpricedConfirmedGrnLine = {
  grnItemId: number;
  grnId: number;
  grnNumber: string;
  ingredientId: number;
  ingredientName: string;
  supplierId: number;
  supplierName: string;
  branchId: number;
  branchName: string;
  acceptedQuantity: number;
  entryUnitId: number | null;
  entryUnitName: string | null;
  unitCostUnitId: number | null;
  unitCostUnitName: string | null;
  receivedDate: string | null;
  suggestedUnitCost: number | null;
  suggestedUnitCostUnitId: number | null;
  suggestedUnitName: string | null;
  suggestedSourceGrnId: number | null;
  suggestedSourceGrnNumber: string | null;
  unitOptions: ConfirmedGrnUnitOption[];
};

export type ConfirmedGrnUnitCostTarget = {
  grnItemId: number;
  grnId: number;
  grnNumber: string;
  ingredientName: string;
  supplierName: string;
  acceptedQuantity: number;
  entryUnitName: string;
  unitCostUnitId: number | null;
  suggestedUnitCost: number | null;
  suggestedUnitCostUnitId: number | null;
  suggestedUnitName: string | null;
  suggestedSourceGrnId: number | null;
  suggestedSourceGrnNumber: string | null;
  unitOptions: ConfirmedGrnUnitOption[];
};

const unitOptionSchema = z.object({
  unitId: z.coerce.number().int().positive(),
  label: z.string(),
});

const nullableNumber = z.preprocess(
  (value) => (value == null || value === "" ? null : value),
  z.coerce.number().nullable(),
);

const nullablePositiveInt = z.preprocess(
  (value) => (value == null || value === "" ? null : value),
  z.coerce.number().int().positive().nullable(),
);

const unpricedLineSchema = z.object({
  grnItemId: z.coerce.number().int().positive(),
  grnId: z.coerce.number().int().positive(),
  grnNumber: z.string(),
  ingredientId: z.coerce.number().int().positive(),
  ingredientName: z.string(),
  supplierId: z.coerce.number().int().positive(),
  supplierName: z.string(),
  branchId: z.coerce.number().int().positive(),
  branchName: z.string(),
  acceptedQuantity: z.coerce.number(),
  entryUnitId: nullablePositiveInt,
  entryUnitName: z.string().nullable(),
  unitCostUnitId: nullablePositiveInt,
  unitCostUnitName: z.string().nullable(),
  receivedDate: z.string().nullable(),
  suggestedUnitCost: nullableNumber,
  suggestedUnitCostUnitId: nullablePositiveInt,
  suggestedUnitName: z.string().nullable(),
  suggestedSourceGrnId: nullablePositiveInt,
  suggestedSourceGrnNumber: z.string().nullable().default(null),
  unitOptions: z.array(unitOptionSchema).default([]),
});

export const unpricedConfirmedGrnQueueSchema = z.object({
  rows: z.array(unpricedLineSchema),
  total: z.coerce.number().int().nonnegative(),
});

export function parseUnpricedConfirmedGrnQueue(
  payload: unknown,
): { rows: UnpricedConfirmedGrnLine[]; total: number } | null {
  const parsed = unpricedConfirmedGrnQueueSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function isUnpricedConfirmedGrnLine(
  line: Pick<GrnDetailItem, "acceptedQuantity" | "costPending" | "monetary">,
): boolean {
  if (line.acceptedQuantity <= 0) return false;
  if (line.costPending) return true;
  const unitPrice = line.monetary?.unitPrice;
  return unitPrice == null || unitPrice <= 0;
}

export function confirmedGrnUnitCostTargetFromQueue(
  row: UnpricedConfirmedGrnLine,
): ConfirmedGrnUnitCostTarget {
  return {
    grnItemId: row.grnItemId,
    grnId: row.grnId,
    grnNumber: row.grnNumber,
    ingredientName: row.ingredientName,
    supplierName: row.supplierName,
    acceptedQuantity: row.acceptedQuantity,
    entryUnitName: row.entryUnitName ?? "",
    unitCostUnitId: row.unitCostUnitId,
    suggestedUnitCost: row.suggestedUnitCost,
    suggestedUnitCostUnitId: row.suggestedUnitCostUnitId,
    suggestedUnitName: row.suggestedUnitName,
    suggestedSourceGrnId: row.suggestedSourceGrnId,
    suggestedSourceGrnNumber: row.suggestedSourceGrnNumber,
    unitOptions: row.unitOptions,
  };
}

export function confirmedGrnUnitCostTargetFromDetail(
  grn: Pick<GrnDetail, "id" | "code" | "supplier">,
  line: GrnDetailItem,
  unitOptions: ConfirmedGrnUnitOption[],
): ConfirmedGrnUnitCostTarget {
  return {
    grnItemId: line.lineId,
    grnId: grn.id,
    grnNumber: grn.code,
    ingredientName: line.name,
    supplierName: line.supplierName || grn.supplier,
    acceptedQuantity: line.acceptedQuantity,
    entryUnitName: line.unit,
    unitCostUnitId: line.unitCostUnitId,
    suggestedUnitCost: line.suggestedUnitCost,
    suggestedUnitCostUnitId: line.suggestedUnitCostUnitId,
    suggestedUnitName: line.suggestedUnitName,
    suggestedSourceGrnId: line.suggestedSourceGrnId,
    suggestedSourceGrnNumber: line.suggestedSourceGrnNumber,
    unitOptions,
  };
}

export function filterUnpricedConfirmedGrnLines(
  rows: UnpricedConfirmedGrnLine[],
  query: string,
): UnpricedConfirmedGrnLine[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    [row.ingredientName, row.supplierName, row.grnNumber, row.branchName]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

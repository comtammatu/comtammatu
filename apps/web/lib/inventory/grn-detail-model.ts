import type { IngredientRow } from "@lib/inventory/types";
import { messages } from "@lib/messages";

export const GRN_DETAIL_COPY = messages.inventory.grn;
export const INVENTORY_COMMON_COPY = messages.inventory.common;

export type GrnDetailItem = {
  lineId: number;
  ingredientId: number;
  name: string;
  sku: string;
  poQuantity: number | null;
  required: number;
  actual: number;
  rejected: number;
  rejectionReason: string;
  rejectedPhotoUrl: string;
  unit: string;
  entryUnitId: number | null;
};

export type GrnDetail = {
  id: number;
  tenantId: number;
  code: string;
  poCode: string;
  poId: number | null;
  poStatus?: string | null;
  invoiceId: number | null;
  branchId: number;
  locationId: number | null;
  locationName: string | null;
  branchName: string;
  supplierId: number;
  supplier: string;
  date: string;
  status: string;
  items: GrnDetailItem[];
};

export type ReceivingLocationOption = {
  id: number;
  name: string;
  branchId: number;
  branchName: string;
  branchKind: string | null;
  kind: string | null;
  isDefaultReceive: boolean;
};

export type EditableGrnLine = GrnDetailItem & { dirty: boolean };

export function isGrnLookupParam(value: string): boolean {
  if (/^\d+$/.test(value)) {
    const numericId = Number(value);
    return Number.isSafeInteger(numericId) && numericId > 0;
  }
  return /^GRN-[A-Za-z0-9_-]{1,60}$/.test(value);
}

export function createEditableGrnLine({
  lineId,
  ingredient,
  quantity,
  entryUnitId,
  unit,
}: {
  lineId: number;
  ingredient: IngredientRow;
  quantity: number;
  entryUnitId: number | null;
  unit: string;
}): EditableGrnLine {
  return {
    lineId,
    ingredientId: ingredient.id,
    name: ingredient.name,
    sku: ingredient.sku ?? "",
    poQuantity: null,
    required: quantity,
    actual: quantity,
    rejected: 0,
    rejectionReason: "",
    rejectedPhotoUrl: "",
    unit,
    entryUnitId,
    dirty: false,
  };
}

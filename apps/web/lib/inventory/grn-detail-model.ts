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
  poUnitPrice: number | null;
  required: number;
  actual: number;
  accepted: number;
  rejected: number;
  rejectionReason: string;
  rejectedPhotoUrl: string;
  priceOverrideNote: string;
  priceOverridePhotoUrl: string;
  priceVariancePct: number | null;
  requiresReview: boolean;
  shortDeliveryAction: "accept_and_close" | "wait_backorder" | null;
  unit: string;
  entryUnitId: number | null;
  cost: number;
  temp: string | null;
  qualityStatus: "accepted" | "rejected" | "partial";
  status: string;
};

export type GrnDetail = {
  id: number;
  tenantId: number;
  code: string;
  poCode: string;
  poId?: number;
  invoiceId: number | null;
  branchId: number;
  locationId: number | null;
  branchName: string;
  supplierId: number;
  supplier: string;
  date: string;
  total: number;
  tax: number;
  status: string;
  items: GrnDetailItem[];
  qcSettings: {
    qtyShortTolerancePct: number;
    priceVarianceWarnPct: number;
    priceVarianceReviewPct: number;
    rejectRequiresPhoto: boolean;
  };
};

export type RecreateReceivingLocationOption = {
  id: number;
  name: string;
  branchId: number;
  branchName: string;
  branchKind: string | null;
  kind: string | null;
  isDefaultReceive: boolean;
};

export type EditableGrnLine = GrnDetailItem & { dirty: boolean };

export function deriveGrnVariance(
  unitCost: number,
  poUnitPrice: number | null,
): number | null {
  if (poUnitPrice == null || poUnitPrice === 0) return null;
  return Number((((unitCost - poUnitPrice) / poUnitPrice) * 100).toFixed(2));
}

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
  unitCost,
}: {
  lineId: number;
  ingredient: IngredientRow;
  quantity: number;
  entryUnitId: number | null;
  unit: string;
  unitCost: number;
}): EditableGrnLine {
  return {
    lineId,
    ingredientId: ingredient.id,
    name: ingredient.name,
    sku: ingredient.sku ?? "",
    poQuantity: null,
    poUnitPrice: null,
    required: quantity,
    actual: quantity,
    accepted: quantity,
    rejected: 0,
    rejectionReason: "",
    rejectedPhotoUrl: "",
    priceOverrideNote: "",
    priceOverridePhotoUrl: "",
    priceVariancePct: null,
    requiresReview: false,
    shortDeliveryAction: null,
    unit,
    entryUnitId,
    cost: unitCost,
    temp: null,
    qualityStatus: "accepted",
    status: "pass",
    dirty: false,
  };
}

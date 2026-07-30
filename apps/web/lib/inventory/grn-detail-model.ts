import type { IngredientRow } from "@lib/inventory/types";
import { messages } from "@lib/messages";
import {
  formatGrnSupplierSummary,
  type GrnCreateSupplierOption,
} from "./grn-create-model";

export const GRN_DETAIL_COPY = messages.inventory.grn;
export const INVENTORY_COMMON_COPY = messages.inventory.common;

export type GrnDetailItem = {
  lineId: number;
  ingredientId: number;
  name: string;
  sku: string;
  supplierId: number;
  supplierName: string;
  poQuantity: number | null;
  previouslyReceived: number;
  remainingQuantity: number;
  required: number;
  actual: number;
  rejected: number;
  acceptedQuantity: number;
  poAppliedQuantity: number;
  shortageQuantity: number;
  excessQuantity: number;
  rejectionReason: string;
  rejectedPhotoUrl: string;
  unit: string;
  entryUnitId: number | null;
  monetary: {
    unitPrice: number | null;
    lineTotal: number;
  } | null;
};

export type GrnLinkedPo = {
  id: number;
  poNumber: string;
  status: string;
  supplierId: number | null;
  supplierName: string;
};

export type GrnDetail = {
  id: number;
  tenantId: number;
  code: string;
  poCode: string;
  poId: number | null;
  poStatus?: string | null;
  purchaseRequestId: number | null;
  purchaseRequestCode: string | null;
  expectedReceiveDate: string | null;
  linkedPos: GrnLinkedPo[];
  invoiceId: number | null;
  branchId: number;
  locationId: number | null;
  locationName: string | null;
  branchName: string;
  supplierId: number | null;
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

export function calculateGrnQuantities(
  receivedQuantity: number,
  rejectedQuantity: number,
  poRemainingQuantity: number,
) {
  const acceptedQuantity = Math.max(receivedQuantity - rejectedQuantity, 0);
  const remainingQuantity = Math.max(poRemainingQuantity, 0);
  const poAppliedQuantity = Math.min(acceptedQuantity, remainingQuantity);
  return {
    acceptedQuantity,
    poAppliedQuantity,
    shortageQuantity: remainingQuantity - poAppliedQuantity,
    excessQuantity: acceptedQuantity - poAppliedQuantity,
  };
}

export function hasAcceptedGrnQuantity(
  lines: readonly Pick<GrnDetailItem, "actual" | "rejected">[],
): boolean {
  return lines.some((line) => line.actual - line.rejected > 0);
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
  supplierId,
  supplierName,
}: {
  lineId: number;
  ingredient: IngredientRow;
  quantity: number;
  entryUnitId: number | null;
  unit: string;
  supplierId: number;
  supplierName: string;
}): EditableGrnLine {
  return {
    lineId,
    ingredientId: ingredient.id,
    name: ingredient.name,
    sku: ingredient.sku ?? "",
    supplierId,
    supplierName,
    poQuantity: null,
    previouslyReceived: 0,
    remainingQuantity: quantity,
    required: quantity,
    actual: quantity,
    rejected: 0,
    acceptedQuantity: quantity,
    poAppliedQuantity: quantity,
    shortageQuantity: 0,
    excessQuantity: 0,
    rejectionReason: "",
    rejectedPhotoUrl: "",
    unit,
    entryUnitId,
    monetary: null,
    dirty: false,
  };
}

export function grnSupplierSummaryFromItems(
  items: readonly Pick<GrnDetailItem, "supplierId" | "supplierName">[],
  fallback?: string | null,
): string {
  const summary = formatGrnSupplierSummary(items);
  if (summary !== "Theo dòng") return summary;
  return fallback?.trim() || "Theo dòng";
}

export function uniqueGrnSuppliers(
  items: readonly Pick<GrnDetailItem, "supplierId" | "supplierName">[],
): GrnCreateSupplierOption[] {
  const seen = new Map<number, string>();
  for (const item of items) {
    if (!seen.has(item.supplierId)) {
      seen.set(item.supplierId, item.supplierName);
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

export function isLinkedPoApproved(status: string | null | undefined): boolean {
  return (
    status === "approved" ||
    status === "sent" ||
    status === "partially_received"
  );
}

export function allLinkedPosApproved(
  linkedPos: readonly Pick<GrnLinkedPo, "status">[],
  legacyPoStatus?: string | null,
): boolean {
  if (linkedPos.length > 0) {
    return linkedPos.every((po) => isLinkedPoApproved(po.status));
  }
  return isLinkedPoApproved(legacyPoStatus);
}

export function hasLinkedPurchaseOrders(
  linkedPos: readonly unknown[],
  poId: number | null,
): boolean {
  return linkedPos.length > 0 || poId != null;
}

import { messages } from "@lib/messages";

export const grnCopy = messages.inventory.grn;
export const inventoryCommon = messages.inventory.common;

export type GRNDetailItem = {
  lineId: number;
  ingredientId: number;
  name: string;
  sku: string;
  poQuantity: number | null;
  poUnitPrice: number | null;
  required: number;
  // "Số đã giao" (gross delivered by the supplier). Stock impact = actual − rejected.
  actual: number;
  // Net good quantity into stock = actual − rejected (derived in page.tsx)
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

export type GRNDetail = {
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
  items: GRNDetailItem[];
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

export type EditableLine = GRNDetailItem & { dirty: boolean };

export function deriveVariance(
  unitCost: number,
  poUnitPrice: number | null,
): number | null {
  if (poUnitPrice == null || poUnitPrice === 0) return null;
  return Number((((unitCost - poUnitPrice) / poUnitPrice) * 100).toFixed(2));
}

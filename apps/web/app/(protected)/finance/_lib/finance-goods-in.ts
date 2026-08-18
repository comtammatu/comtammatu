import type { FinanceLocation } from "./finance-params";

/** Branch views cost received transfers; company views confirmed input invoices. */
export type PeriodGoodsInKind = "inbound_transfer" | "inventory_purchase";

export const CONFIRMED_SUPPLIER_INVOICE_STATUSES = [
  "confirmed",
  "adjusted",
] as const;

export interface PeriodGoodsInAllocation {
  allocatedValue: number;
  allocationBucket: string | null;
  eventType: string | null;
  branchId: number | null;
  grnId: number | null;
}

export interface PeriodSupplierInvoiceGoodsIn {
  documentStatus: string;
  subtotal: number;
}

export function periodGoodsInKindForLocation(
  location: FinanceLocation,
): PeriodGoodsInKind {
  return location === "branch" || location === "branches"
    ? "inbound_transfer"
    : "inventory_purchase";
}

export function periodGoodsInEventTypes(
  kind: PeriodGoodsInKind,
): readonly string[] {
  return kind === "inbound_transfer" ? ["transfer_in"] : [];
}

export function isConfirmedSupplierInvoiceGoodsIn(status: string): boolean {
  return (
    status === "confirmed" || status === "adjusted"
  );
}

export function sumConfirmedSupplierInvoiceSubtotals(
  rows: readonly PeriodSupplierInvoiceGoodsIn[],
): number {
  let total = 0;
  for (const row of rows) {
    if (isConfirmedSupplierInvoiceGoodsIn(row.documentStatus)) {
      total += row.subtotal;
    }
  }
  return total;
}

/**
 * Branch goods-in: received transfer_in only. Excludes in-transit, YC, POS
 * shortfall receipts, and company invoices (those sit on HĐ đầu vào).
 */
export function isPeriodGoodsInAllocation(
  row: PeriodGoodsInAllocation,
  kind: PeriodGoodsInKind,
  allowedBranchIds: ReadonlySet<number> | null,
): boolean {
  if (kind !== "inbound_transfer") return false;
  if (row.allocationBucket !== "inventory") return false;
  if (row.eventType !== "transfer_in") return false;
  if (allowedBranchIds == null) return row.branchId != null;
  return row.branchId != null && allowedBranchIds.has(row.branchId);
}

export function sumPeriodGoodsIn(
  rows: readonly PeriodGoodsInAllocation[],
  kind: PeriodGoodsInKind,
  allowedBranchIds: ReadonlySet<number> | null,
): number {
  let total = 0;
  for (const row of rows) {
    if (isPeriodGoodsInAllocation(row, kind, allowedBranchIds)) {
      total += row.allocatedValue;
    }
  }
  return total;
}

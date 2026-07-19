// Shared finance types — extracted from former /finance/page.tsx so the
// page can become a thin redirect without breaking importers.
//
// Keep this file in `_lib/` (private to the finance module) per the
// Shared route helpers live under `apps/web/app/_lib`.

export interface TopItemRow {
  period_start: string;
  period_end: string;
  branch_id: number;
  tenant_id: number;
  menu_item_id: number;
  item_name: string;
  quantity_sold: number;
  revenue: number;
}

export interface InvoiceRow {
  id: number;
  order_id: number | null;
  invoice_number: string | null;
  status: string;
  buyer_name: string | null;
  buyer_tax_code: string | null;
  buyer_email: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  issued_at: string | null;
  cancelled_at: string | null;
  archived_at: string | null;
  created_at: string;
  orders: { order_number: string } | null;
}

// Preview for the manual "issue HĐĐT for a past paid order" dialog. Read-only
// snapshot resolved by (branch, order_number); issuance still runs through
// createTaxInvoice, which re-checks every guard server-side.
export interface ManualInvoiceOrderPreview {
  orderId: number;
  orderNumber: string;
  branchId: number;
  totalAmount: number;
  createdAt: string;
  paymentStatus: string | null;
  existingInvoiceStatus: string | null;
  existingInvoiceNumber: string | null;
  isDraftRetry: boolean;
  hasActiveItems: boolean;
  summaryDate: string | null;
  issuable: boolean;
}

export interface FinanceDashboardHealth {
  cashVarianceSessionCount: number;
  cashVarianceAbsAmount: number;
  foodCostExceptionCount: number;
  topFoodCostExceptionName: string | null;
  topFoodCostExceptionPct: number | null;
}

export type { FinanceDashboardSummary } from "../actions";

// Shared finance types — extracted from former /finance/page.tsx so the
// page can become a thin redirect without breaking importers.
//
// Keep this file in `_lib/` (private to the finance module) per the
// `apps/web/app/_lib`, `apps/web/app/(protected)/admin/_lib` convention.

// NOTE: InvoiceRow lives below — extended with `archived_at` 2026-05-13
// for the Path D PDF/XML archive feature.

export interface DailyRevenueRow {
  date: string;
  branch_id: number;
  tenant_id: number;
  order_count: number;
  total_revenue: number | null;
  total_tax: number | null;
  cash_revenue: number | null;
  vietqr_revenue: number | null;
  momo_revenue: number | null;
}

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
  invoice_number: string | null;
  status: string;
  buyer_name: string | null;
  buyer_tax_code: string | null;
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

export interface FiscalPeriodRow {
  id: number;
  period_month: number;
  period_year: number;
  status: string;
  closed_by: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface FinanceDashboardHealth {
  currentPeriodLabel: string;
  currentPeriodStatus: string;
  reconciliationExceptionCount: number;
  reconciliationDifference: number;
  cashVarianceSessionCount: number;
  cashVarianceAbsAmount: number;
  foodCostExceptionCount: number;
  topFoodCostExceptionName: string | null;
  topFoodCostExceptionPct: number | null;
}

export type { FinanceDashboardSummary } from "../actions";

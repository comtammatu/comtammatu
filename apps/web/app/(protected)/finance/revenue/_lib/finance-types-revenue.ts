export interface AccessibleBranch {
  id: number;
  name: string;
}

export interface RollupRow {
  period_start: string;
  period_end: string;
  period_label: string;
  branch_id: number;
  order_count: number;
  total_revenue: number | null;
  total_tax: number | null;
  subtotal_revenue: number | null;
  discount_amount: number | null;
  cash_revenue: number | null;
  vietqr_revenue: number | null;
  platform_revenue: number | null;
  dine_in_revenue: number | null;
  takeaway_revenue: number | null;
  delivery_revenue: number | null;
}

export interface KpiBundle {
  net_revenue: number;
  subtotal_revenue: number;
  discount_amount: number;
  total_tax: number;
  vat_by_rate: Record<string, number>;
  vat_total: number;
  order_count: number;
  cash_revenue: number;
  vietqr_revenue: number;
  platform_revenue: number;
  dine_in_revenue: number;
  takeaway_revenue: number;
  delivery_revenue: number;
  voided_amount: number;
  voided_count: number;
  refreshed_at: string;
}

export interface ComparePeriod {
  start: string;
  end: string;
  kpis: KpiBundle | null;
}

export interface WorstCashier {
  cashier_id: string | null;
  cashier_name: string;
  session_count: number;
  net_variance: number;
  abs_variance: number;
}

export interface CashVarianceSummary {
  session_count: number;
  total_variance: number;
  abs_variance_total: number;
  short_count: number;
  short_total: number;
  over_count: number;
  over_total: number;
  worst_cashiers: WorstCashier[];
}

export interface HourBucket {
  dow: number;
  hour: number;
  order_count: number;
  net_revenue: number;
}

export interface CashierRow {
  cashier_id: string | null;
  cashier_name: string;
  order_count: number;
  net_revenue: number;
  cash_revenue: number;
  qr_revenue: number;
}

export interface FinanceFoodCostRow {
  item_name: string | null;
  food_cost_pct: number | null;
}

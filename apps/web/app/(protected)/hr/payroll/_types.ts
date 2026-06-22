export interface PayrollPeriodRow {
  id: number;
  tenant_id: number;
  period_month: number;
  period_year: number;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

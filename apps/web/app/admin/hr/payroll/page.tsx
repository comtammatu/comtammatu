import { fetchPayrollPeriods } from "../payroll-actions";
import { PayrollListClient } from "./payroll-list-client";

export default async function PayrollPage() {
  const result = await fetchPayrollPeriods();
  const periods = result.success
    ? ((result.data ?? []) as PayrollPeriodRow[])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bảng lương</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tạo kỳ lương, tính lương, duyệt và thanh toán
        </p>
      </div>

      <PayrollListClient initialPeriods={periods} />
    </div>
  );
}

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

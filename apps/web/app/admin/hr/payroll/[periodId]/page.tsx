import { fetchPayrollEntries } from "../../payroll-actions";
import { PayrollDetailClient } from "./payroll-detail-client";

export default async function PayrollDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const id = Number(periodId);

  if (!id || id <= 0) {
    return (
      <p className="p-8 text-center text-muted-foreground">ID không hợp lệ</p>
    );
  }

  const result = await fetchPayrollEntries(id);
  const entries = result.success
    ? ((result.data ?? []) as PayrollEntryRow[])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Chi tiết bảng lương
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kỳ lương #{periodId}
        </p>
      </div>

      <PayrollDetailClient periodId={id} initialEntries={entries} />
    </div>
  );
}

export interface PayrollEntryRow {
  id: number;
  employee_id: number;
  working_days: number;
  standard_days: number;
  base_salary: number;
  gross_total: number;
  total_insurance_employee: number;
  total_insurance_employer: number;
  personal_deduction: number;
  dependent_count: number;
  dependent_deduction: number;
  taxable_income: number;
  pit_tax: number;
  advance_deduction: number;
  other_deductions: number;
  net_salary: number;
  insurance_base: number;
  employees: {
    id: number;
    employee_code: string;
    profiles: { full_name: string } | null;
  } | null;
}

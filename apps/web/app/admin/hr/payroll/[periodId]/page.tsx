import { Card, CardContent } from "@comtammatu/ui/components/card";
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
      <div className="space-y-5 lg:space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="space-y-1.5">
              <h3 className="text-2xl font-semibold">ID không hợp lệ</h3>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Không thể mở chi tiết bảng lương vì mã kỳ lương không đúng.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const result = await fetchPayrollEntries({ periodId: id });
  const entries = result.success
    ? ((result.data ?? []) as PayrollEntryRow[])
    : [];

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Tiền lương
              </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Chi tiết bảng lương
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Kỳ lương #{periodId}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
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

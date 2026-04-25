import { fetchPayrollEntries } from "../../payroll-actions";
import { TriangleAlert as IconAlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
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
      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="flex size-8 items-center justify-center rounded-full border bg-muted">
              <IconAlertTriangle className="size-4" />
            </div>
            <CardTitle className="text-xl">ID không hợp lệ</CardTitle>
          </div>
          <CardDescription>
            Không thể mở chi tiết bảng lương vì mã kỳ lương không đúng.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const result = await fetchPayrollEntries({ periodId: id });
  const entries = result.success
    ? ((result.data ?? []) as PayrollEntryRow[])
    : [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Nhân sự & lương
          </p>
          <CardTitle>Chi tiết bảng lương</CardTitle>
          <CardDescription>Kỳ lương #{periodId}</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardContent>
          <PayrollDetailClient periodId={id} initialEntries={entries} />
        </CardContent>
      </Card>
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

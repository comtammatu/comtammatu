import { Card, CardContent } from "@comtammatu/ui/components/card";
import { fetchPayrollPeriods } from "../payroll-actions";
import { PayrollListClient } from "./payroll-list-client";

export default async function PayrollPage() {
  const result = await fetchPayrollPeriods();
  const periods = result.success
    ? ((result.data ?? []) as PayrollPeriodRow[])
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
                Bảng lương
              </h2>
            </div>
          </div>
        </CardContent>
      </Card>
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

import { fetchPayrollPeriods } from "../payroll-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { PayrollListClient } from "./payroll-list-client";

export default async function PayrollPage() {
  const result = await fetchPayrollPeriods();
  const periods = result.success
    ? ((result.data ?? []) as PayrollPeriodRow[])
    : [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Nhân sự & lương
          </p>
          <CardTitle>Bảng lương</CardTitle>
          <CardDescription>Quản lý kỳ lương và trạng thái chi trả.</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardContent>
          <PayrollListClient initialPeriods={periods} />
        </CardContent>
      </Card>
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

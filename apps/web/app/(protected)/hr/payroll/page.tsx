import { fetchPayrollPeriods } from "../payroll-actions";
import { AppPage, AppPageHeader } from "@/components/surface";
import { PayrollListClient } from "./payroll-list-client";

export default async function PayrollPage() {
  const result = await fetchPayrollPeriods();
  const periods = result.success
    ? ((result.data ?? []) as PayrollPeriodRow[])
    : [];

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Nhân sự"
        title="Lương đã chốt"
        description="Theo dõi kỳ lương đã tính khi cần đối soát."
      />
      <PayrollListClient initialPeriods={periods} />
    </AppPage>
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

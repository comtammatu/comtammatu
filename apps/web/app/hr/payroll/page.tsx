import { fetchPayrollPeriods } from "../payroll-actions";
import {
  PageContainer,
  PageHeader,
} from "@/components/foundation/ui-patterns";
import { PayrollListClient } from "./payroll-list-client";

export default async function PayrollPage() {
  const result = await fetchPayrollPeriods();
  const periods = result.success
    ? ((result.data ?? []) as PayrollPeriodRow[])
    : [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Nhân sự & lương"
        title="Bảng lương"
      />
      <PayrollListClient initialPeriods={periods} />
    </PageContainer>
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

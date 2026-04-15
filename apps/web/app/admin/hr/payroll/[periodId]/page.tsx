import { fetchPayrollEntries } from "../../payroll-actions";
import {
  EmptyState,
  PageContainer,
  PageHeader,
} from "@/components/v2/patterns";
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
      <PageContainer>
        <EmptyState
          title="ID không hợp lệ"
          description="Không thể mở chi tiết bảng lương vì mã kỳ lương không đúng."
        />
      </PageContainer>
    );
  }

  const result = await fetchPayrollEntries(id);
  const entries = result.success
    ? ((result.data ?? []) as PayrollEntryRow[])
    : [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Phân hệ ERP"
        title="Chi tiết bảng lương"
        description={`Kỳ lương #${periodId}`}
      />
      <PayrollDetailClient periodId={id} initialEntries={entries} />
    </PageContainer>
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

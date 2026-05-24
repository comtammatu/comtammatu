import { fetchPayrollEntries } from "../../payroll-actions";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AuditHistoryList } from "@/components/audit-history-list";
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
      <AppPage>
        <AppEmptyState
          mode="no-access"
          title="ID không hợp lệ"
          description="Không thể mở chi tiết bảng lương vì mã kỳ lương không đúng."
        />
      </AppPage>
    );
  }

  const [result, auditLogs] = await Promise.all([
    fetchPayrollEntries({ periodId: id }),
    fetchEntityAuditLogs("payroll_period", id, 50),
  ]);
  const entries = result.success
    ? ((result.data ?? []) as PayrollEntryRow[])
    : [];

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Nhân sự & lương"
        title={`Chi tiết bảng lương`}
        description={`Kỳ lương #${periodId}`}
        tabs={
          <AppPageTabs
            items={[
              { value: "overview", label: "Tổng quan" },
              { value: "entries", label: "Đơn vị", count: entries.length },
              { value: "history", label: "Lịch sử", count: auditLogs.length },
            ]}
          >
            <TabsContent value="overview" className="mt-4">
              <PayrollDetailClient periodId={id} initialEntries={entries} />
            </TabsContent>
            <TabsContent value="entries" className="mt-4">
              <PayrollDetailClient periodId={id} initialEntries={entries} />
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <AuditHistoryList logs={auditLogs} />
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
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

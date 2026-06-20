import { fetchPayrollEntries } from "../../payroll-actions";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AuditHistoryList } from "@/components/audit-history-list";
import { PayrollDetailClient } from "./payroll-detail-client";
import { messages } from "@lib/messages";

export default async function PayrollDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const copy = messages.hr.payroll;
  const id = Number(periodId);

  if (!id || id <= 0) {
    return (
      <AppPage>
        <AppEmptyState
          mode="no-access"
          title={copy.detail.invalidTitle}
          description={copy.detail.invalidDescription}
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
        eyebrow={copy.eyebrow}
        title={copy.detail.title}
        description={copy.detail.description(periodId)}
        badge={{ children: copy.supportBadge, variant: "secondary" }}
        tabs={
          <AppPageTabs
            items={[
              { value: "overview", label: copy.detail.tabs.overview },
              {
                value: "entries",
                label: copy.detail.tabs.entries,
                count: entries.length,
              },
              {
                value: "history",
                label: copy.detail.tabs.history,
                count: auditLogs.length,
              },
            ]}
          >
            <TabsContent value="overview">
              <PayrollDetailClient periodId={id} initialEntries={entries} />
            </TabsContent>
            <TabsContent value="entries">
              <PayrollDetailClient periodId={id} initialEntries={entries} />
            </TabsContent>
            <TabsContent value="history">
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

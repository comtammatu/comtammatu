import Link from "next/link";
import { fetchPayrollEntries, fetchPayrollPeriod } from "../../payroll-actions";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AuditHistoryList } from "@/components/audit-history-list";
import { PayrollDetailClient } from "./payroll-detail-client";
import type { PayrollEntryRow, PayrollPeriodDetail } from "./_types";
import { Button } from "@comtammatu/ui/components/button";
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
      <AppPage width="wide" density="compact">
        <AppEmptyState
          mode="no-access"
          title={copy.detail.invalidTitle}
          description={copy.detail.invalidDescription}
        />
      </AppPage>
    );
  }

  const [periodResult, result, auditLogs] = await Promise.all([
    fetchPayrollPeriod({ periodId: id }),
    fetchPayrollEntries({ periodId: id }),
    fetchEntityAuditLogs("payroll_period", id, 50),
  ]);
  const period = periodResult.success
    ? ((periodResult.data ?? null) as PayrollPeriodDetail | null)
    : null;
  const entries = result.success
    ? ((result.data ?? []) as PayrollEntryRow[])
    : [];

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.detail.title}
        description={copy.detail.description(periodId)}
        badge={{ children: copy.supportBadge, variant: "secondary" }}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/hr/payroll">{copy.backToPayroll}</Link>
          </Button>
        }
        tabs={
          <AppPageTabs
            items={[
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
            <TabsContent value="entries" className="flex flex-col gap-4">
              <PayrollDetailClient
                periodId={id}
                initialPeriod={period}
                initialEntries={entries}
              />
            </TabsContent>
            <TabsContent value="history" className="flex flex-col gap-4">
              <AuditHistoryList logs={auditLogs} />
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
  );
}

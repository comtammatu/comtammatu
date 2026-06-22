import { fetchPayrollEntries } from "../../payroll-actions";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AuditHistoryList } from "@/components/audit-history-list";
import { PayrollDetailClient } from "./payroll-detail-client";
import type { PayrollEntryRow } from "./_types";
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

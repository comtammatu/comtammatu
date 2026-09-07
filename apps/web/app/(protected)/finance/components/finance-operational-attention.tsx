import { AppSection, KpiRow } from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
import { messages } from "@lib/messages";
import type { FinanceCockpitData } from "../_lib/finance-cockpit";
import { financeHref, type FinanceParams } from "../_lib/finance-params";

const financeCopy = messages.finance;

interface FinanceOperationalAttentionProps {
  cockpit: FinanceCockpitData;
  params: FinanceParams;
}

export function FinanceOperationalAttention({
  cockpit,
  params,
}: FinanceOperationalAttentionProps) {
  const invoiceAttentionCount =
    cockpit.dashboardSummary?.invoice_attention_count ?? 0;
  const opexMissing = !cockpit.kpis.operatingExpenseRecorded;
  const costIncomplete = !cockpit.kpis.costAvailable;
  const overduePayableCount = cockpit.overduePayables?.count ?? 0;

  const hasAttentionItems =
    invoiceAttentionCount > 0 ||
    opexMissing ||
    costIncomplete ||
    overduePayableCount > 0;

  if (!hasAttentionItems) {
    return null;
  }

  return (
    <AppSection
      size="sm"
      title={financeCopy.powerLite.ownerNewsTitle}
    >
      <KpiRow density="compact" className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {overduePayableCount > 0 && (
          <KpiCard
            density="compact"
            label={financeCopy.powerLite.exceptions.supplierInvoiceOverdueLabel}
            value={`${overduePayableCount} hóa đơn`}
            tone="destructive"
            hint={financeCopy.powerLite.exceptions.supplierInvoiceOverdueHint(
              String(overduePayableCount),
            )}
            href={financeHref("/finance/supplier-invoices", params, { overdue: "1" })}
          />
        )}
        {invoiceAttentionCount > 0 && (
          <KpiCard
            density="compact"
            label={financeCopy.powerLite.hddtComplianceTitle}
            value={`${invoiceAttentionCount} việc`}
            tone="warning"
            hint={financeCopy.powerLite.exceptions.invoiceAttentionHint}
            href={financeHref("/finance/invoices", params, { queue: "attention" })}
          />
        )}
        {opexMissing && (
          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.operatingExpense}
            value={financeCopy.basic.kpis.notRecorded}
            tone="warning"
            hint={financeCopy.basic.kpis.operatingExpenseZeroHint}
            href={financeHref("/finance/expenses", params, { state: "pending" })}
          />
        )}
        {costIncomplete && (
          <KpiCard
            density="compact"
            label={financeCopy.basic.kpis.ingredientCost}
            value={financeCopy.basic.kpis.missingCost(
              String(
                Math.max(
                  0,
                  cockpit.kpis.orderCount - cockpit.kpis.costCoverageOrderCount,
                ),
              ),
            )}
            tone="warning"
            hint={financeCopy.powerLite.exceptions.missingCostHint}
            href={financeHref("/finance/food-cost", params)}
          />
        )}
      </KpiRow>
    </AppSection>
  );
}

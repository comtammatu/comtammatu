import Link from "next/link";
import {
  Boxes as IconBoxes,
  ReceiptText as IconReceiptText,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import { getInventoryValueVisibility } from "@comtammatu/shared/auth";
import { formatVND } from "@comtammatu/shared/format";
import { getVNDateString } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { KpiCard } from "@/components/kpi/kpi-card";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
  KpiRow,
} from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { buildCompareDelta } from "@/components/kpi/compare-chip";
import { FilterBar } from "./components/filter-bar";
import {
  parseFinanceParams,
  resolveFinanceRange,
  type FinanceRange,
} from "./_lib/finance-params";
import {
  fetchFinanceCockpit,
  type FinanceCockpitData,
} from "./_lib/finance-cockpit";
import { fetchCashSummary } from "./_lib/cash-cockpit";
import type { FinanceOverviewSearchParams } from "./_lib/finance-overview-types";
import { CashPanel } from "./components/cash-panel";

const financeCopy = messages.finance;
const powerLiteCopy = financeCopy.powerLite;
const HKD_RANGES: readonly FinanceRange[] = ["today", "yesterday", "7d", "mtd"];

function formatCount(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function HddtComplianceBand({
  summary,
}: {
  summary: FinanceCockpitData["dashboardSummary"];
}) {
  const needsWork = (summary?.invoice_attention_count ?? 0) > 0;

  return (
    <AppSection
      size="sm"
      title={powerLiteCopy.hddtComplianceTitle}
      description={powerLiteCopy.hddtComplianceDescription}
      badge={{
        children: needsWork
          ? powerLiteCopy.hddtComplianceNeedsWork
          : powerLiteCopy.hddtComplianceOk,
        variant: needsWork ? "warning" : "success",
      }}
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/finance/invoices?queue=attention">
            {powerLiteCopy.hddtComplianceAction}
          </Link>
        </Button>
      }
    >
      {summary ? (
        <KpiRow density="compact" className="lg:grid-cols-3">
          <KpiCard
            label={powerLiteCopy.hddtIssued}
            value={formatCount(summary.invoice_issued_count)}
            density="compact"
          />
          <KpiCard
            label={powerLiteCopy.hddtAttention}
            value={formatCount(summary.invoice_attention_count)}
            tone={summary.invoice_attention_count > 0 ? "warning" : "neutral"}
            density="compact"
          />
          <KpiCard
            label={powerLiteCopy.hddtNotRequired}
            value={formatCount(summary.invoice_not_required_count)}
            density="compact"
          />
        </KpiRow>
      ) : (
        <AppEmptyState
          compact
          title={powerLiteCopy.hddtNoDataTitle}
          description={powerLiteCopy.hddtNoDataDescription}
        />
      )}
    </AppSection>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams?: Promise<FinanceOverviewSearchParams>;
}) {
  const rawParams = searchParams ? await searchParams : {};
  const params = parseFinanceParams(rawParams);
  const resolved = resolveFinanceRange(params);
  const { claims } = await loadAuthState();
  const inventoryValueVisibility = getInventoryValueVisibility(
    claims.user_role,
  );
  // Drill into the inventory-value report only when the role can see it; the
  // report's own visibility gate would otherwise render no-access.
  const canViewInventoryValue =
    inventoryValueVisibility.system || inventoryValueVisibility.branch;
  const [cockpit, cash] = await Promise.all([
    fetchFinanceCockpit(params, resolved),
    fetchCashSummary(params, resolved),
  ]);
  const cashDeltaAfterPaidExpenses =
    cockpit.kpis.totalCollected - cash.expensesPaidPeriod;
  const todayBusinessDate = getVNDateString();

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={powerLiteCopy.eyebrow}
        title={powerLiteCopy.title}
        description={powerLiteCopy.description}
        meta={financeCopy.basic.periodMeta(resolved.start, resolved.end)}
      />

      <FilterBar
        params={params}
        branches={cockpit.branches}
        basePath="/finance"
        ranges={HKD_RANGES}
        hide={["granularity", "compare", "payment"]}
      />

      <CashPanel
        cashOnHand={cash.hasOpening ? cash.cashOnHand : null}
        openingBalance={cash.openingBalance}
        openingDate={cash.openingDate}
        cashInSince={cash.cashInSince}
        cashOutSince={cash.cashOutSince}
        hasBankOpening={cash.hasBankOpening}
        bankOnHand={cash.bankOnHand}
        bankOpeningBalance={cash.bankOpeningBalance}
        bankInSince={cash.bankInSince}
        bankOutSince={cash.bankOutSince}
        cashDeltaAfterPaidExpenses={cashDeltaAfterPaidExpenses}
        todayBusinessDate={todayBusinessDate}
      />

      <KpiRow density="compact" className="xl:grid-cols-4">
        <KpiCard
          icon={<IconWallet className="size-4 text-muted-foreground" />}
          label={financeCopy.basic.kpis.revenue}
          value={formatVND(cockpit.kpis.totalCollected)}
          hint={financeCopy.basic.kpis.revenueHint(
            formatCount(cockpit.kpis.orderCount),
            formatVND(cockpit.kpis.netRevenueBeforeVat),
          )}
          tone="primary"
          href="/finance/revenue"
          delta={
            cockpit.compareKpis
              ? buildCompareDelta(
                  cockpit.kpis.totalCollected,
                  cockpit.compareKpis.totalCollected,
                  "higher_better",
                )
              : null
          }
        />

        <KpiCard
          icon={<IconBoxes className="size-4 text-muted-foreground" />}
          label={financeCopy.basic.kpis.inventoryValue}
          value={formatVND(cockpit.kpis.inventoryValue)}
          hint={financeCopy.basic.kpis.inventoryValueHint}
          href={
            canViewInventoryValue ? "/finance/inventory-value" : undefined
          }
        />

        <KpiCard
          icon={<IconReceiptText className="size-4 text-muted-foreground" />}
          label={financeCopy.basic.kpis.operatingExpense}
          value={formatVND(cockpit.kpis.operatingExpense)}
          hint={financeCopy.basic.kpis.operatingExpenseHint}
          href="/finance/expenses"
        />

        <KpiCard
          icon={<IconTrendingUp className="size-4 text-muted-foreground" />}
          label={financeCopy.basic.kpis.grossProfit}
          value={
            cockpit.kpis.costAvailable
              ? formatVND(cockpit.kpis.grossProfit)
              : financeCopy.common.noValue
          }
          hint={
            cockpit.kpis.costAvailable
              ? financeCopy.basic.kpis.grossProfitHint(
                  formatVND(cockpit.kpis.ingredientCost),
                  formatPercent(cockpit.kpis.grossMargin),
                )
              : powerLiteCopy.exceptions.missingCostHint
          }
          tone={
            cockpit.kpis.costAvailable
              ? cockpit.kpis.grossProfit >= 0
                ? "success"
                : "warning"
              : undefined
          }
          href="/finance/food-cost"
          delta={
            cockpit.kpis.costAvailable && cockpit.compareKpis
              ? buildCompareDelta(
                  cockpit.kpis.grossProfit,
                  cockpit.compareKpis.grossProfit,
                  "higher_better",
                )
              : null
          }
        />
      </KpiRow>

      <HddtComplianceBand summary={cockpit.dashboardSummary} />
    </AppPage>
  );
}

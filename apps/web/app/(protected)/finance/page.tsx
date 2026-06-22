import Link from "next/link";
import {
  AlertTriangle as IconAlertTriangle,
  Boxes as IconBoxes,
  ReceiptText as IconReceiptText,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { getVNDateString } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { cn } from "@comtammatu/ui/lib/utils";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
  KpiRow,
} from "@/components/surface";
import { messages } from "@lib/messages";
import { buildCompareDelta } from "@/components/kpi/compare-chip";
import { KpiCard } from "@/components/kpi/kpi-card";
import { FilterBar } from "./components/filter-bar";
import {
  parseFinanceParams,
  resolveFinanceRange,
  type FinanceRange,
} from "./_lib/finance-params";
import {
  fetchFinanceCockpit,
  type FinanceCockpitData,
  type FinanceException,
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

function MetricInline({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate font-mono text-sm font-semibold tabular-nums",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function HddtComplianceBand({
  summary,
}: {
  summary: FinanceCockpitData["dashboardSummary"];
}) {
  const needsWork =
    (summary?.invoice_attention_count ?? 0) > 0 ||
    (summary?.failed_webhook_count ?? 0) > 0;

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
        <KpiRow density="compact" className="lg:grid-cols-4">
          <MetricInline
            label={powerLiteCopy.hddtIssued}
            value={formatCount(summary.invoice_issued_count)}
          />
          <MetricInline
            label={powerLiteCopy.hddtAttention}
            value={formatCount(summary.invoice_attention_count)}
            muted={summary.invoice_attention_count === 0}
          />
          <MetricInline
            label={powerLiteCopy.hddtNotRequired}
            value={formatCount(summary.invoice_not_required_count)}
            muted={summary.invoice_not_required_count === 0}
          />
          <MetricInline
            label={powerLiteCopy.hddtWebhookFailures}
            value={formatCount(summary.failed_webhook_count)}
            muted={summary.failed_webhook_count === 0}
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

function ExceptionList({ items }: { items: FinanceException[] }) {
  const visibleItems = items.filter((item) => item.tone !== "neutral");

  if (visibleItems.length === 0) {
    return (
      <AppEmptyState compact title={powerLiteCopy.noOwnerNews} />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {visibleItems.slice(0, 4).map((item) => (
        <Alert
          key={item.label}
          variant={item.tone === "destructive" ? "destructive" : "default"}
        >
          <IconAlertTriangle
            className={cn(
              item.tone === "destructive" ? "text-destructive" : "text-warning",
            )}
          />
          <AlertTitle className="flex items-center justify-between gap-2">
            <span className="truncate">{item.label}</span>
            <span className="font-mono font-semibold tabular-nums">
              {item.value}
            </span>
          </AlertTitle>
          <AlertDescription>{item.hint}</AlertDescription>
          {item.href ? (
            <AlertAction>
              <Button asChild variant="outline" size="sm">
                <Link href={item.href}>{powerLiteCopy.openWorkItem}</Link>
              </Button>
            </AlertAction>
          ) : null}
        </Alert>
      ))}
    </div>
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
          href="/admin/reports/inventory-value"
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

      <CashPanel
        cashOnHand={cash.hasOpening ? cash.cashOnHand : null}
        openingBalance={cash.openingBalance}
        openingDate={cash.openingDate}
        cashInSince={cash.cashInSince}
        cashOutSince={cash.cashOutSince}
        cashDeltaAfterPaidExpenses={cashDeltaAfterPaidExpenses}
        todayBusinessDate={todayBusinessDate}
      />

      <HddtComplianceBand summary={cockpit.dashboardSummary} />

      <AppSection
        size="sm"
        icon={<IconAlertTriangle className="size-4" />}
        title={powerLiteCopy.ownerNewsTitle}
      >
        <ExceptionList items={cockpit.exceptions} />
      </AppSection>
    </AppPage>
  );
}

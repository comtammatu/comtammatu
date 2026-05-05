"use client";

import Link from "next/link";
import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Book as IconBook,
  CalendarDays as IconCalendar,
  ChartBar as IconChartBar,
  FileText as IconFileText,
  Receipt as IconReceipt,
  ScrollText as IconScrollText,
  Settings2 as IconSettings,
  TriangleAlert as IconAlertTriangle,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { formatVND } from "@comtammatu/shared/format";
import { AppLinkCard, AppSection, AppToolbar } from "@/components/surface";
import { messages } from "@lib/messages";
import type { FinanceLayoutMode } from "./page";
import type {
  DailyRevenueRow,
  FinanceDashboardHealth,
  FinanceDashboardSummary,
  InvoiceRow,
  TopItemRow,
} from "./page";
import type { AccessibleBranch, KpiBundle } from "./revenue/page";
import { InvoiceList } from "./invoice-list";
import { RevenueOverview } from "./revenue-overview";
import { useFinanceRealtimeRefresh } from "./use-finance-realtime-refresh";

const FOOD_COST_EXCEPTION_THRESHOLD = 60;
const financeCopy = messages.finance;

interface FinanceClientProps {
  layout: FinanceLayoutMode;
  branches: AccessibleBranch[];
  branchId: number | null;
  today: string;
  periodStart: string;
  todayKpis: KpiBundle | null;
  yesterdayKpis: KpiBundle | null;
  monthKpis: KpiBundle | null;
  dailyRevenue: DailyRevenueRow[];
  topItems: TopItemRow[];
  invoices: InvoiceRow[];
  dashboardSummary: FinanceDashboardSummary | null;
  dashboardHealth: FinanceDashboardHealth;
}

export function FinanceClient({
  layout,
  branches,
  branchId,
  today,
  periodStart,
  todayKpis,
  yesterdayKpis,
  monthKpis,
  dailyRevenue,
  topItems,
  invoices,
  dashboardSummary,
  dashboardHealth,
}: FinanceClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  useFinanceRealtimeRefresh({ branchId });

  const branchLabel = useMemo(() => {
    if (branchId == null) return financeCopy.common.allBranches;
    return (
      branches.find((b) => b.id === branchId)?.name ??
      financeCopy.common.branchFallback(branchId)
    );
  }, [branchId, branches]);

  function replaceParams(next: {
    layout?: FinanceLayoutMode;
    branch?: string;
  }) {
    const usp = new URLSearchParams(searchParams);
    if (next.layout) usp.set("layout", next.layout);
    if (next.branch) usp.set("branch", next.branch);
    startTransition(() => {
      router.replace(`/finance?${usp.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="space-y-4">
      <AppToolbar className="items-end justify-between">
        <div className="grid gap-2 sm:min-w-64">
          <span className="text-xs font-medium text-muted-foreground">
            {financeCopy.dashboard.branch}
          </span>
          <Select
            value={branchId == null ? "all" : String(branchId)}
            onValueChange={(value) => replaceParams({ branch: value })}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder={financeCopy.dashboard.branchPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{financeCopy.common.allBranches}</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <LayoutPicker
          value={layout}
          onChange={(next) => replaceParams({ layout: next })}
        />
      </AppToolbar>

      {layout === "simple" ? (
        <SimpleFinanceOverview
          branchLabel={branchLabel}
          today={today}
          periodStart={periodStart}
          todayKpis={todayKpis}
          yesterdayKpis={yesterdayKpis}
          monthKpis={monthKpis}
          dailyRevenue={dailyRevenue}
          topItems={topItems}
          dashboardSummary={dashboardSummary}
          dashboardHealth={dashboardHealth}
        />
      ) : (
        <AdvancedFinanceWorkspace
          dailyRevenue={dailyRevenue}
          topItems={topItems}
          invoices={invoices}
        />
      )}
    </div>
  );
}

function LayoutPicker({
  value,
  onChange,
}: {
  value: FinanceLayoutMode;
  onChange: (value: FinanceLayoutMode) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as FinanceLayoutMode)}
    >
      <TabsList className="w-full md:w-auto">
        <TabsTrigger value="simple" className="flex-1 md:flex-none">
          {financeCopy.dashboard.simple}
        </TabsTrigger>
        <TabsTrigger value="advanced" className="flex-1 md:flex-none">
          {financeCopy.dashboard.advanced}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function SimpleFinanceOverview({
  branchLabel,
  today,
  periodStart,
  todayKpis,
  yesterdayKpis,
  monthKpis,
  dailyRevenue,
  topItems,
  dashboardSummary,
  dashboardHealth,
}: {
  branchLabel: string;
  today: string;
  periodStart: string;
  todayKpis: KpiBundle | null;
  yesterdayKpis: KpiBundle | null;
  monthKpis: KpiBundle | null;
  dailyRevenue: DailyRevenueRow[];
  topItems: TopItemRow[];
  dashboardSummary: FinanceDashboardSummary | null;
  dashboardHealth: FinanceDashboardHealth;
}) {
  const todayRevenue = todayKpis?.net_revenue;
  const yesterdayRevenue = yesterdayKpis?.net_revenue;
  const orderCount = todayKpis?.order_count;
  const averageOrder =
    todayRevenue != null && orderCount != null && orderCount > 0
      ? todayRevenue / orderCount
      : null;
  const daily = dailyRevenue.slice(-7).reverse();
  const paymentTotal = todayKpis
    ? todayKpis.cash_revenue + todayKpis.vietqr_revenue + todayKpis.momo_revenue
    : null;

  return (
    <div className="space-y-4">
      <FinanceWorkQueue
        summary={dashboardSummary}
        health={dashboardHealth}
      />

      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="space-y-2">
            <Badge variant="secondary">
              {financeCopy.dashboard.liveBranch(branchLabel)}
            </Badge>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{today}</p>
              <p className="text-3xl font-bold tabular-nums text-primary">
                {formatMoneyMetric(todayRevenue)}
              </p>
              <p className="text-sm text-muted-foreground">
                {todayRevenue == null || yesterdayRevenue == null
                  ? financeCopy.dashboard.noComparison
                  : financeCopy.dashboard.comparison(
                      formatDelta(todayRevenue, yesterdayRevenue),
                    )}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label={financeCopy.dashboard.todayOrders}
              value={formatCount(orderCount)}
            />
            <Metric
              label={financeCopy.dashboard.averageOrder}
              value={formatMoneyMetric(averageOrder)}
            />
            <Metric
              label={financeCopy.dashboard.issuedInvoices}
              value={formatCount(dashboardSummary?.invoice_issued_count)}
              hint={financeCopy.dashboard.taxCodeNotRequired(
                formatCount(dashboardSummary?.invoice_not_required_count),
              )}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {financeCopy.dashboard.recentDays}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {daily.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {financeCopy.dashboard.noRecentRevenue}
              </p>
            ) : (
              daily.map((row) => (
                <div
                  key={row.date}
                  className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
                >
                  <div>
                    <p className="font-medium tabular-nums">{row.date}</p>
                    <p className="text-xs text-muted-foreground">
                      {financeCopy.dashboard.orders(
                        row.order_count.toLocaleString("vi-VN"),
                      )}
                    </p>
                  </div>
                  <p className="text-right font-semibold tabular-nums">
                    {formatVND(row.total_revenue ?? 0)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {financeCopy.dashboard.todayPayments}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PaymentLine
              label={financeCopy.dashboard.cash}
              value={todayKpis?.cash_revenue}
              total={paymentTotal}
            />
            <PaymentLine
              label={financeCopy.dashboard.vietqr}
              value={todayKpis?.vietqr_revenue}
              total={paymentTotal}
            />
            <PaymentLine
              label={financeCopy.dashboard.momo}
              value={todayKpis?.momo_revenue}
              total={paymentTotal}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {financeCopy.dashboard.topItemsTitle}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {financeCopy.dashboard.dateRange(periodStart, today)}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {topItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {financeCopy.dashboard.noItemData}
              </p>
            ) : (
              topItems.slice(0, 5).map((item) => (
                <div
                  key={`${item.branch_id}-${item.menu_item_id}`}
                  className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
                >
                  <div>
                    <p className="font-medium">{item.item_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {financeCopy.dashboard.portions(
                        Number(item.quantity_sold).toLocaleString("vi-VN"),
                      )}
                    </p>
                  </div>
                  <p className="text-right font-semibold tabular-nums">
                    {formatVND(item.revenue)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {financeCopy.dashboard.currentMonth}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric
              label={financeCopy.dashboard.monthRevenue}
              value={formatMoneyMetric(monthKpis?.net_revenue)}
            />
            <Metric
              label={financeCopy.dashboard.discount}
              value={formatMoneyMetric(monthKpis?.discount_amount)}
            />
            <Metric
              label={financeCopy.dashboard.outputVat}
              value={formatMoneyMetric(monthKpis?.total_tax)}
            />
            <Metric
              label={financeCopy.dashboard.voidedAmount}
              value={formatMoneyMetric(monthKpis?.voided_amount)}
              hint={financeCopy.dashboard.orders(
                formatCount(monthKpis?.voided_count),
              )}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURE_LINKS.map((feature) => (
          <AppLinkCard
            key={feature.href}
            href={feature.href}
            title={feature.label}
            description={feature.description}
            icon={feature.icon}
            tone={feature.tone}
            ctaLabel={financeCopy.dashboard.featureCta}
          />
        ))}
      </div>
    </div>
  );
}

function AdvancedFinanceWorkspace({
  dailyRevenue,
  topItems,
  invoices,
}: {
  dailyRevenue: DailyRevenueRow[];
  topItems: TopItemRow[];
  invoices: InvoiceRow[];
}) {
  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            {financeCopy.dashboard.workflowTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {financeCopy.dashboard.workflowDescription}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_LINKS.map((feature) => (
            <AppLinkCard
              key={feature.href}
              href={feature.href}
              title={feature.label}
              description={feature.description}
              icon={feature.icon}
              tone={feature.tone}
              ctaLabel={financeCopy.dashboard.featureCta}
            />
          ))}
        </div>
      </section>

      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto p-2">
          <TabsTrigger value="revenue">
            {financeCopy.dashboard.tabs.revenue}
          </TabsTrigger>
          <TabsTrigger value="invoices">
            {financeCopy.dashboard.tabs.invoices(invoices.length)}
          </TabsTrigger>
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link href="/finance/reconciliation">
              <IconAlertTriangle className="mr-1 size-4 text-warning" />
              {financeCopy.dashboard.tabs.reconciliation}
            </Link>
          </Button>
        </TabsList>

        <TabsContent value="revenue" className="mt-0">
          <RevenueOverview dailyRevenue={dailyRevenue} topItems={topItems} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-0">
          <InvoiceList initialInvoices={invoices} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FinanceWorkQueue({
  summary,
  health,
}: {
  summary: FinanceDashboardSummary | null;
  health: FinanceDashboardHealth;
}) {
  return (
    <AppSection
      title={financeCopy.dashboard.workQueue.title}
      description={financeCopy.dashboard.workQueue.description}
      contentClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Metric
        label={financeCopy.dashboard.workQueue.period}
        value={formatPeriodStatus(health.currentPeriodStatus)}
        hint={health.currentPeriodLabel}
      />
      <Metric
        label={financeCopy.dashboard.workQueue.invoicesAttention}
        value={formatCount(summary?.invoice_attention_count)}
        hint={financeCopy.dashboard.workQueue.invoicesAttentionHint}
      />
      <Metric
        label={financeCopy.dashboard.workQueue.draftJournals}
        value={formatCount(summary?.journal_draft_count)}
        hint={financeCopy.dashboard.workQueue.postedJournalsHint(
          formatCount(summary?.journal_posted_count),
        )}
      />
      <Metric
        label={financeCopy.dashboard.workQueue.reconciliationDiff}
        value={formatCount(health.reconciliationExceptionCount)}
        hint={financeCopy.dashboard.workQueue.totalDifferenceHint(
          formatMoneyMetric(health.reconciliationDifference),
        )}
      />
      <Metric
        label={financeCopy.dashboard.workQueue.cashVariance}
        value={formatCount(health.cashVarianceSessionCount)}
        hint={financeCopy.dashboard.workQueue.absoluteVarianceHint(
          formatMoneyMetric(health.cashVarianceAbsAmount),
        )}
      />
      <Metric
        label={financeCopy.dashboard.workQueue.foodCostAlert}
        value={formatCount(health.foodCostExceptionCount)}
        hint={
          health.topFoodCostExceptionName
            ? `${health.topFoodCostExceptionName} · ${formatPercent(health.topFoodCostExceptionPct)}`
            : financeCopy.dashboard.workQueue.thresholdHint(
                formatPercent(FOOD_COST_EXCEPTION_THRESHOLD),
              )
        }
      />
      <Metric
        label={financeCopy.dashboard.workQueue.webhookFailures}
        value={formatCount(summary?.failed_webhook_count)}
        hint={financeCopy.dashboard.workQueue.webhookFailuresHint}
      />
    </AppSection>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function PaymentLine({
  label,
  value,
  total,
}: {
  label: string;
  value: number | null | undefined;
  total: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium tabular-nums">
        {formatMoneyMetric(value)}
        <span className="ml-2 text-xs text-muted-foreground">
          {value != null && total != null && total > 0
            ? `${Math.round((value / total) * 100)}%`
            : "—"}
        </span>
      </span>
    </div>
  );
}

function formatCount(value: number | null | undefined): string {
  if (value == null) return financeCopy.common.noValue;
  return value.toLocaleString("vi-VN");
}

function formatMoneyMetric(value: number | null | undefined): string {
  if (value == null) return financeCopy.common.noValue;
  return formatVND(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return financeCopy.common.noValue;
  return `${value.toFixed(1)}%`;
}

function formatPeriodStatus(status: string): string {
  if (status === "open") return financeCopy.dashboard.periodStatus.open;
  if (status === "closing") return financeCopy.dashboard.periodStatus.closing;
  if (status === "closed") return financeCopy.dashboard.periodStatus.closed;
  if (status === "missing") return financeCopy.dashboard.periodStatus.missing;
  return status;
}

function formatDelta(current: number, previous: number): string {
  if (previous === 0 && current === 0) return "0%";
  if (previous === 0) return financeCopy.dashboard.deltaNew;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

const FEATURE_LINKS = [
  {
    href: "/finance/revenue",
    label: financeCopy.links.revenue.label,
    icon: IconTrendingUp,
    description: financeCopy.links.revenue.description,
    tone: "primary",
  },
  {
    href: "/finance/reconciliation",
    label: financeCopy.links.reconciliation.label,
    icon: IconAlertTriangle,
    description: financeCopy.links.reconciliation.description,
    tone: "warning",
  },
  {
    href: "/finance/chart-of-accounts",
    label: financeCopy.links.chartOfAccounts.label,
    icon: IconBook,
    description: financeCopy.links.chartOfAccounts.description,
    tone: "info",
  },
  {
    href: "/finance/journal",
    label: financeCopy.links.journal.label,
    icon: IconFileText,
    description: financeCopy.links.journal.description,
    tone: "secondary",
  },
  {
    href: "/finance/posting-rules",
    label: financeCopy.links.postingRules.label,
    icon: IconSettings,
    description: financeCopy.links.postingRules.description,
    tone: "secondary",
  },
  {
    href: "/finance/statements",
    label: financeCopy.links.statements.label,
    icon: IconChartBar,
    description: financeCopy.links.statements.description,
    tone: "success",
  },
  {
    href: "/finance/food-cost",
    label: financeCopy.links.foodCost.label,
    icon: IconReceipt,
    description: financeCopy.links.foodCost.description,
    tone: "warning",
  },
  {
    href: "/finance/periods",
    label: financeCopy.links.periods.label,
    icon: IconCalendar,
    description: financeCopy.links.periods.description,
    tone: "info",
  },
  {
    href: "/finance/audit-trail",
    label: financeCopy.links.auditTrail.label,
    icon: IconScrollText,
    description: financeCopy.links.auditTrail.description,
    tone: "secondary",
  },
  {
    href: "/finance",
    label: financeCopy.links.overview.label,
    icon: IconWallet,
    description: financeCopy.links.overview.description,
    tone: "primary",
  },
] as const;

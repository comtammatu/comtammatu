import type { ReactNode } from "react";
import {
  AlertTriangle as IconAlertTriangle,
  Boxes as IconBoxes,
  PiggyBank as IconPiggyBank,
  ReceiptText as IconReceiptText,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { cn } from "@comtammatu/ui/lib/utils";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
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
  type FinanceException,
  type FinanceInventoryItem,
} from "./_lib/finance-cockpit";
import { fetchCashSummary } from "./_lib/cash-cockpit";
import { CashPanel } from "./components/cash-panel";

type SearchParams = Record<string, string | string[] | undefined>;

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

function QuickPanel({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <AppSection size="sm" title={title} icon={icon} className="min-w-0">
      {children}
    </AppSection>
  );
}

function InventoryCapitalList({ items }: { items: FinanceInventoryItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {powerLiteCopy.emptyInventoryRanking}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 3).map((item) => (
        <div
          key={`${item.branchName}-${item.ingredientName}`}
          className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto]"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {item.ingredientName}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.branchName} ·{" "}
              {powerLiteCopy.labels.inventoryQuantity(
                formatCount(item.quantity),
              )}
            </p>
          </div>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {formatVND(item.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function ExceptionList({ items }: { items: FinanceException[] }) {
  const visibleItems = items.filter((item) => item.tone !== "neutral");

  if (visibleItems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {powerLiteCopy.noOwnerNews}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {visibleItems.slice(0, 4).map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-md border p-3",
            item.tone === "destructive"
              ? "border-destructive/30 bg-destructive/5"
              : "border-warning/30 bg-warning/5",
          )}
        >
          <div className="flex items-start gap-2">
            <IconAlertTriangle
              className={cn(
                "mt-0.5 size-4 shrink-0",
                item.tone === "destructive"
                  ? "text-destructive"
                  : "text-warning",
              )}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{item.label}</p>
                <p className="font-mono text-sm font-semibold tabular-nums">
                  {item.value}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">{item.hint}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const rawParams = searchParams ? await searchParams : {};
  const params = parseFinanceParams(rawParams);
  const resolved = resolveFinanceRange(params);
  const [cockpit, cash] = await Promise.all([
    fetchFinanceCockpit(params, resolved),
    fetchCashSummary(params, resolved),
  ]);
  const cashProfit = cockpit.kpis.totalCollected - cash.expensesPaidPeriod;
  const todayBusinessDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
          value={formatVND(cockpit.kpis.grossProfit)}
          hint={financeCopy.basic.kpis.grossProfitHint(
            formatVND(cockpit.kpis.ingredientCost),
            formatPercent(cockpit.kpis.grossMargin),
          )}
          tone={cockpit.kpis.grossProfit >= 0 ? "success" : "warning"}
          href="/finance/food-cost"
          delta={
            cockpit.compareKpis
              ? buildCompareDelta(
                  cockpit.kpis.grossProfit,
                  cockpit.compareKpis.grossProfit,
                  "higher_better",
                )
              : null
          }
        />

        <KpiCard
          icon={<IconPiggyBank className="size-4 text-muted-foreground" />}
          label={financeCopy.basic.kpis.netProfit}
          value={formatVND(cockpit.kpis.netProfit)}
          hint={financeCopy.basic.kpis.netProfitHint(
            formatVND(cockpit.kpis.grossProfit),
            formatVND(cockpit.kpis.operatingExpense),
          )}
          tone={cockpit.kpis.netProfit >= 0 ? "success" : "warning"}
          delta={
            cockpit.compareKpis
              ? buildCompareDelta(
                  cockpit.kpis.netProfit,
                  cockpit.compareKpis.netProfit,
                  "higher_better",
                )
              : null
          }
        />
      </div>

      <CashPanel
        cashOnHand={cash.hasOpening ? cash.cashOnHand : null}
        openingBalance={cash.openingBalance}
        openingDate={cash.openingDate}
        cashInSince={cash.cashInSince}
        cashOutSince={cash.cashOutSince}
        cashProfit={cashProfit}
        netProfit={cockpit.kpis.netProfit}
        todayBusinessDate={todayBusinessDate}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <QuickPanel
          icon={<IconWallet className="size-4" />}
          title={powerLiteCopy.cashBreakdownTitle}
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricInline
              label={powerLiteCopy.labels.cash}
              value={formatVND(cockpit.kpis.cashRevenue)}
            />
            <MetricInline
              label={powerLiteCopy.labels.vietqr}
              value={formatVND(cockpit.kpis.vietqrRevenue)}
            />
            <MetricInline
              label={powerLiteCopy.labels.momo}
              value={formatVND(cockpit.kpis.momoRevenue)}
            />
            <MetricInline
              label={powerLiteCopy.labels.revenueBeforeVat}
              value={formatVND(cockpit.kpis.netRevenueBeforeVat)}
            />
          </div>
        </QuickPanel>

        <QuickPanel
          icon={<IconTrendingUp className="size-4" />}
          title={powerLiteCopy.profitBreakdownTitle}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricInline
              label={powerLiteCopy.labels.revenueBeforeVat}
              value={formatVND(cockpit.kpis.netRevenueBeforeVat)}
            />
            <MetricInline
              label={powerLiteCopy.labels.ingredientCost}
              value={formatVND(cockpit.kpis.ingredientCost)}
            />
            <MetricInline
              label={powerLiteCopy.labels.grossMargin}
              value={formatPercent(cockpit.kpis.grossMargin)}
            />
          </div>
        </QuickPanel>

        <QuickPanel
          icon={<IconBoxes className="size-4" />}
          title={powerLiteCopy.inventoryModelTitle}
        >
          <InventoryCapitalList items={cockpit.inventoryItems} />
        </QuickPanel>

        <QuickPanel
          icon={<IconAlertTriangle className="size-4" />}
          title={powerLiteCopy.ownerNewsTitle}
        >
          <ExceptionList items={cockpit.exceptions} />
        </QuickPanel>
      </div>
    </AppPage>
  );
}

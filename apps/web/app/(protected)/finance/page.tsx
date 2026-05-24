import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle as IconAlertTriangle,
  Boxes as IconBoxes,
  Building2 as IconBuilding2,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { FilterBar } from "./components/filter-bar";
import {
  parseFinanceParams,
  resolveFinanceRange,
  serializeFinanceParams,
  type FinanceParams,
  type FinanceRange,
} from "./_lib/finance-params";
import {
  fetchFinanceCockpit,
  type FinanceBranchRow,
  type FinanceException,
} from "./_lib/finance-cockpit";

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

function hrefWithFinanceParams(path: string, params: FinanceParams): string {
  const usp = serializeFinanceParams(params);
  const query = usp.toString();
  return query ? `${path}?${query}` : path;
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
        className={
          muted
            ? "truncate font-mono text-sm tabular-nums text-muted-foreground"
            : "truncate font-mono text-sm font-semibold tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}

function QuestionCard({
  icon,
  title,
  description,
  value,
  tone = "text-foreground",
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  value: string;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className={`font-mono text-3xl font-bold tabular-nums ${tone}`}>
          {value}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}

function ExceptionRow({ item }: { item: FinanceException }) {
  const toneClass =
    item.tone === "destructive"
      ? "border-destructive/30 bg-destructive/5"
      : item.tone === "warning"
        ? "border-warning/30 bg-warning/5"
        : "bg-muted/20";

  const body = (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <IconAlertTriangle
          className={
            item.tone === "destructive"
              ? "mt-0.5 size-4 text-destructive"
              : item.tone === "warning"
                ? "mt-0.5 size-4 text-warning"
                : "mt-0.5 size-4 text-muted-foreground"
          }
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
  );

  if (!item.href) return body;
  return (
    <Link
      href={item.href}
      className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {body}
    </Link>
  );
}

function BranchComparison({ rows }: { rows: FinanceBranchRow[] }) {
  if (rows.length <= 1) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconBuilding2 className="size-4 text-muted-foreground" />
          <CardTitle>{powerLiteCopy.branchTitle}</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          {powerLiteCopy.branchDescription}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.slice(0, 4).map((row) => (
          <div
            key={row.branchId}
            className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.branchName}</p>
              <p className="text-xs text-muted-foreground">
                {powerLiteCopy.grossMarginLine(formatPercent(row.grossMargin))}
              </p>
            </div>
            <MetricInline
              label={powerLiteCopy.labels.branchRevenue}
              value={formatVND(row.revenue)}
            />
            <MetricInline
              label={powerLiteCopy.labels.branchGrossProfit}
              value={formatVND(row.grossProfit)}
            />
            <MetricInline
              label={powerLiteCopy.labels.branchInventory}
              value={formatVND(row.inventoryValue)}
            />
            <MetricInline
              label={powerLiteCopy.labels.branchCashVariance}
              value={formatVND(row.cashVariance)}
              muted={row.cashVariance === 0}
            />
          </div>
        ))}
      </CardContent>
    </Card>
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
  const cockpit = await fetchFinanceCockpit(params, resolved);

  const revenueHref = hrefWithFinanceParams("/finance/revenue", params);
  const foodCostHref = hrefWithFinanceParams("/finance/food-cost", params);

  return (
    <AppPage width="wide">
      <AppPageHeader
        eyebrow={powerLiteCopy.eyebrow}
        title={powerLiteCopy.title}
        description={powerLiteCopy.description}
        meta={financeCopy.basic.periodMeta(resolved.start, resolved.end)}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={revenueHref}>
                <IconWallet />
                {financeCopy.basic.actions.revenue}
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={foodCostHref}>
                <IconTrendingUp />
                {financeCopy.basic.actions.grossProfit}
              </Link>
            </Button>
          </>
        }
      />

      <FilterBar
        params={params}
        branches={cockpit.branches}
        basePath="/finance"
        ranges={HKD_RANGES}
        hide={["granularity", "compare", "payment"]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <QuestionCard
          icon={<IconWallet className="size-4 text-muted-foreground" />}
          title={powerLiteCopy.cashTitle}
          description={powerLiteCopy.cashDescription}
          value={formatVND(cockpit.kpis.totalCollected)}
          tone="text-primary"
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricInline
              label={powerLiteCopy.labels.orders}
              value={formatCount(cockpit.kpis.orderCount)}
            />
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
          </div>
        </QuestionCard>

        <QuestionCard
          icon={<IconTrendingUp className="size-4 text-muted-foreground" />}
          title={powerLiteCopy.profitTitle}
          description={powerLiteCopy.profitDescription}
          value={formatVND(cockpit.kpis.grossProfit)}
          tone={cockpit.kpis.grossProfit >= 0 ? "text-success" : "text-warning"}
        >
          <div className="grid gap-3 sm:grid-cols-4">
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
            <MetricInline
              label={powerLiteCopy.labels.operatingExpense}
              value={formatVND(cockpit.kpis.operatingExpense)}
            />
          </div>
        </QuestionCard>

        <QuestionCard
          icon={<IconBoxes className="size-4 text-muted-foreground" />}
          title={powerLiteCopy.inventoryCashTitle}
          description={powerLiteCopy.inventoryCashDescription}
          value={formatVND(cockpit.kpis.inventoryValue)}
        >
          <div className="space-y-2">
            {cockpit.inventoryItems.length > 0 ? (
              cockpit.inventoryItems.slice(0, 3).map((item) => (
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
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {powerLiteCopy.emptyInventoryRanking}
              </p>
            )}
          </div>
        </QuestionCard>

        <QuestionCard
          icon={<IconAlertTriangle className="size-4 text-muted-foreground" />}
          title={powerLiteCopy.actionTitle}
          description={powerLiteCopy.actionDescription}
          value={formatCount(
            cockpit.exceptions.filter((item) => item.tone !== "neutral").length,
          )}
          tone={
            cockpit.exceptions.some((item) => item.tone === "destructive")
              ? "text-destructive"
              : cockpit.exceptions.some((item) => item.tone === "warning")
                ? "text-warning"
                : "text-success"
          }
        >
          <div className="space-y-2">
            {cockpit.exceptions.map((item) => (
              <ExceptionRow key={item.label} item={item} />
            ))}
          </div>
        </QuestionCard>
      </div>

      <BranchComparison rows={cockpit.branchRows} />
    </AppPage>
  );
}

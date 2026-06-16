import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { cn } from "@comtammatu/ui/lib/utils";
import { formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import type {
  FinanceDashboardHealth,
  FinanceDashboardSummary,
} from "../_lib/finance-types";

// Operational queue strip — keep the default Finance support queue focused on
// HKD operating checks. Accounting-close tiles exist for direct support routes,
// but are not part of the pilot default set.
//
// Architect §1: extracted from finance-client.tsx:485-547 so the same
// data composition works for /finance/revenue, /finance/reconciliation,
// and /finance/food-cost. The owner page-level RSCs
// fetch the inputs once and pass them down.

const FOOD_COST_EXCEPTION_THRESHOLD = 60;
const copy = messages.finance.dashboard;

interface WorkQueueStripProps {
  summary: FinanceDashboardSummary | null;
  health: FinanceDashboardHealth;
  /** Hide tiles that don't apply on a given route. Default: all visible. */
  hide?: ReadonlyArray<WorkQueueTile>;
  className?: string;
}

type WorkQueueTile = "invoices" | "cash" | "foodCost" | "webhook";

const DEFAULT_TILES: WorkQueueTile[] = [
  "invoices",
  "cash",
  "foodCost",
  "webhook",
];

function formatCount(value: number | null | undefined): string {
  if (value == null) return messages.finance.common.noValue;
  return value.toLocaleString("vi-VN");
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return messages.finance.common.noValue;
  return formatVND(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return messages.finance.common.noValue;
  return `${value.toFixed(1)}%`;
}

interface MetricProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning" | "destructive";
}

function Metric({ label, value, hint, tone = "neutral" }: MetricProps) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        tone === "warning" && "border-warning/30 bg-warning/5",
        tone === "destructive" && "border-destructive/30 bg-destructive/5",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function WorkQueueStrip({
  summary,
  health,
  hide = [],
  className,
}: WorkQueueStripProps) {
  const visible = DEFAULT_TILES.filter((t) => !hide.includes(t));
  if (visible.length === 0) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {copy.workQueue.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {copy.workQueue.description}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visible.includes("invoices") && (
          <Metric
            label={copy.workQueue.invoicesAttention}
            value={formatCount(summary?.invoice_attention_count)}
            hint={copy.workQueue.invoicesAttentionHint}
            tone={
              (summary?.invoice_attention_count ?? 0) > 0
                ? "warning"
                : "neutral"
            }
          />
        )}
        {visible.includes("cash") && (
          <Metric
            label={copy.workQueue.cashVariance}
            value={formatCount(health.cashVarianceSessionCount)}
            hint={copy.workQueue.absoluteVarianceHint(
              formatMoney(health.cashVarianceAbsAmount),
            )}
            tone={
              health.cashVarianceAbsAmount >= 500_000
                ? "destructive"
                : health.cashVarianceAbsAmount > 0
                  ? "warning"
                  : "neutral"
            }
          />
        )}
        {visible.includes("foodCost") && (
          <Metric
            label={copy.workQueue.foodCostAlert}
            value={formatCount(health.foodCostExceptionCount)}
            hint={
              health.topFoodCostExceptionName
                ? `${health.topFoodCostExceptionName} · ${formatPercent(health.topFoodCostExceptionPct)}`
                : copy.workQueue.thresholdHint(
                    formatPercent(FOOD_COST_EXCEPTION_THRESHOLD),
                  )
            }
            tone={health.foodCostExceptionCount > 0 ? "warning" : "neutral"}
          />
        )}
        {visible.includes("webhook") && (
          <Metric
            label={copy.workQueue.webhookFailures}
            value={formatCount(summary?.failed_webhook_count)}
            hint={copy.workQueue.webhookFailuresHint}
            tone={
              (summary?.failed_webhook_count ?? 0) > 0
                ? "destructive"
                : "neutral"
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

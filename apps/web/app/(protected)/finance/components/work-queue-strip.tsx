import {
  formatCount,
  formatPercent,
  formatVND,
} from "@comtammatu/shared/format";
import { KpiCard } from "@/components/kpi/kpi-card";
import { AppSection, KpiRow } from "@/components/surface";
import { messages } from "@lib/messages";
import type {
  FinanceDashboardHealth,
  FinanceDashboardSummary,
} from "../_lib/finance-types";

// Operational queue strip — keep the default Finance support queue focused on
// Operating checks. Accounting-close tiles exist for direct support routes,
// but are not part of the pilot default set.
//
// Architect §1: extracted from finance-client.tsx:485-547 so the same
// data composition works for /finance/revenue and /finance/food-cost. The
// owner page-level RSCs fetch the inputs once and pass them down.

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

function formatNullableCount(value: number | null | undefined): string {
  if (value == null) return messages.finance.common.noValue;
  return formatCount(value);
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return messages.finance.common.noValue;
  return formatVND(value);
}

function formatNullablePercent(value: number | null | undefined): string {
  if (value == null) return messages.finance.common.noValue;
  return formatPercent(value);
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
    <AppSection
      title={copy.workQueue.title}
      description={copy.workQueue.description}
      className={className}
    >
      <KpiRow density="compact" className="lg:grid-cols-4">
        {visible.includes("invoices") && (
          <KpiCard
            density="compact"
            label={copy.workQueue.invoicesAttention}
            value={formatNullableCount(summary?.invoice_attention_count)}
            hint={copy.workQueue.invoicesAttentionHint}
            tone={
              (summary?.invoice_attention_count ?? 0) > 0
                ? "warning"
                : "neutral"
            }
          />
        )}
        {visible.includes("cash") && (
          <KpiCard
            density="compact"
            label={copy.workQueue.cashVariance}
            value={formatNullableCount(health.cashVarianceSessionCount)}
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
          <KpiCard
            density="compact"
            label={copy.workQueue.foodCostAlert}
            value={formatNullableCount(health.foodCostExceptionCount)}
            hint={
              health.topFoodCostExceptionName
                ? `${health.topFoodCostExceptionName} · ${formatNullablePercent(health.topFoodCostExceptionPct)}`
                : copy.workQueue.thresholdHint(
                    formatNullablePercent(FOOD_COST_EXCEPTION_THRESHOLD),
                  )
            }
            tone={health.foodCostExceptionCount > 0 ? "warning" : "neutral"}
          />
        )}
        {visible.includes("webhook") && (
          <KpiCard
            density="compact"
            label={copy.workQueue.webhookFailures}
            value={formatNullableCount(summary?.failed_webhook_count)}
            hint={copy.workQueue.webhookFailuresHint}
            tone={
              (summary?.failed_webhook_count ?? 0) > 0
                ? "destructive"
                : "neutral"
            }
          />
        )}
      </KpiRow>
    </AppSection>
  );
}

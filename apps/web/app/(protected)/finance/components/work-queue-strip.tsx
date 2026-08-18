import {
  formatAccountingVND as formatVND,
  formatCount,
  formatPercent,
} from "@comtammatu/shared/format";
import { KpiCard } from "@/components/kpi/kpi-card";
import { AppSection, KpiRow } from "@/components/surface";
import { messages } from "@lib/messages";
import type {
  FinanceDashboardHealth,
  FinanceDashboardSummary,
} from "../_lib/finance-types";
import { financeHref, type FinanceParams } from "../_lib/finance-params";

// Operational queue strip — keep the default Finance support queue focused on
// Operating checks. Accounting-close tiles exist for direct support routes,
// but are not part of the pilot default set.
//
// Architect §1: extracted from finance-client.tsx:485-547 so the same
// data composition works for /finance/revenue and /finance/food-cost. The
// owner page-level RSCs fetch the inputs once and pass them down.

const copy = messages.finance.dashboard;

interface WorkQueueStripProps {
  summary: FinanceDashboardSummary | null;
  health: FinanceDashboardHealth;
  /** Hide tiles that don't apply on a given route. Default: all visible. */
  hide?: ReadonlyArray<WorkQueueTile>;
  className?: string;
  /** When set, tiles deep-link into the matching workflow with this scope. */
  scope?: FinanceParams;
  /** Prefer a concrete POS-session href when a variance target is known. */
  cashVarianceHref?: string;
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
  scope,
  cashVarianceHref,
}: WorkQueueStripProps) {
  const visible = DEFAULT_TILES.filter((t) => !hide.includes(t));
  if (visible.length === 0) return null;

  const invoiceAttentionCount = summary?.invoice_attention_count ?? 0;
  const invoicesHref = scope
    ? financeHref("/finance/invoices", scope, {
        queue: invoiceAttentionCount > 0 ? "attention" : null,
      })
    : undefined;
  const foodCostHref = scope
    ? financeHref("/finance/food-cost", scope)
    : undefined;
  const webhookHref = scope
    ? financeHref("/finance/bank-transactions", scope, {
        recon: "needs_review",
      })
    : undefined;
  const cashHref =
    cashVarianceHref ??
    (scope?.branch != null
      ? `/br/${String(scope.branch)}/pos-sessions`
      : undefined);

  return (
    <AppSection
      title={copy.workQueue.title}
      className={className}
    >
      <KpiRow density="compact" className="lg:grid-cols-4">
        {visible.includes("invoices") && (
          <KpiCard
            density="compact"
            label={copy.workQueue.invoicesAttention}
            value={formatNullableCount(summary?.invoice_attention_count)}
            tone={invoiceAttentionCount > 0 ? "warning" : "neutral"}
            href={invoicesHref}
          />
        )}
        {visible.includes("cash") && (
          <KpiCard
            density="compact"
            label={copy.workQueue.cashVariance}
            value={formatNullableCount(health.cashVarianceSessionCount)}
            hint={formatMoney(health.cashVarianceAbsAmount)}
            tone={
              health.cashVarianceAbsAmount >= 500_000
                ? "destructive"
                : health.cashVarianceAbsAmount > 0
                  ? "warning"
                  : "neutral"
            }
            href={cashHref}
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
                : undefined
            }
            tone={health.foodCostExceptionCount > 0 ? "warning" : "neutral"}
            href={foodCostHref}
          />
        )}
        {visible.includes("webhook") && (
          <KpiCard
            density="compact"
            label={copy.workQueue.webhookFailures}
            value={formatNullableCount(summary?.failed_webhook_count)}
            tone={
              (summary?.failed_webhook_count ?? 0) > 0
                ? "destructive"
                : "neutral"
            }
            href={webhookHref}
          />
        )}
      </KpiRow>
    </AppSection>
  );
}

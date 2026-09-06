import Link from "next/link";
import { AppSection, KpiRow } from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
import { Badge } from "@comtammatu/ui/components/badge";
import { Frame } from "@comtammatu/ui/components/frame";
import { messages } from "@lib/messages";
import type { PeriodReadinessRpc, PeriodReadinessFinding } from "../_lib/finance-period-readiness";
import { financeHref, type FinanceParams } from "../_lib/finance-params";

const copy = messages.finance.basic.exceptions;

interface FinancePeriodReadinessCardProps {
  readiness: PeriodReadinessRpc | null;
  params: FinanceParams;
}

function resolveFindingHref(code: string, params: FinanceParams): string | null {
  switch (code) {
    case "bank_reconciliation_open":
      return financeHref("/finance/bank-transactions", params, { recon: "unmatched" });
    case "negative_stock":
      return "/inventory/stock";
    case "unpaid_supplier_invoices":
      return financeHref("/finance/supplier-invoices", params, { paymentStatus: "unpaid" });
    case "operating_expense_missing":
    case "expenses_needs_action":
      return financeHref("/finance/expenses", params);
    case "food_cost_coverage_incomplete":
      return financeHref("/finance/food-cost", params);
    case "cash_variance_open":
      return financeHref("/finance/revenue", params);
    case "valuation_not_reconciled":
    case "valuation_reconciliation_unreadable":
      return "/inventory/reports";
    default:
      return null;
  }
}

export function FinancePeriodReadinessCard({
  readiness,
  params,
}: FinancePeriodReadinessCardProps) {
  if (!readiness) return null;

  const { blockerCount, warningCount, canClose, blockers, warnings } = readiness;
  const tone = canClose
    ? warningCount > 0
      ? "neutral"
      : "success"
    : "destructive";

  const statusText = canClose
    ? warningCount > 0
      ? "Đủ điều kiện chốt sổ (có lưu ý)"
      : "Sẵn sàng chốt sổ"
    : "Chưa đủ điều kiện chốt sổ";

  const allFindings = [
    ...blockers.map((f) => ({ ...f, isBlocker: true })),
    ...warnings.map((f) => ({ ...f, isBlocker: false })),
  ];

  return (
    <AppSection size="sm" title={copy.readinessLabel}>
      <div className="grid gap-3">
        <KpiRow density="compact" className="grid-cols-1 sm:grid-cols-2">
          <KpiCard
            density="compact"
            label={copy.readinessLabel}
            value={statusText}
            tone={tone}
            hint={copy.readinessValue(String(blockerCount), String(warningCount))}
          />
        </KpiRow>

        {allFindings.length > 0 && (
          <Frame className="grid gap-2 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {messages.finance.powerLite.exceptionsTitle}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {allFindings.map((finding: PeriodReadinessFinding & { isBlocker: boolean }) => {
                const label = copy.readinessCodes[finding.code] ?? copy.unknownFinding;
                const href = resolveFindingHref(finding.code, params);
                const detailText = finding.count != null
                  ? `(${finding.count})`
                  : finding.branches != null && finding.branches.length > 0
                    ? `(CN: ${finding.branches.join(", ")})`
                    : null;

                const content = (
                  <Frame className="flex items-center justify-between gap-2 p-2 text-xs transition-colors hover:bg-muted/50">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant={finding.isBlocker ? "destructive" : "warning"}>
                        {finding.isBlocker ? "Chặn" : "Lưu ý"}
                      </Badge>
                      <span className="truncate font-medium text-foreground">
                        {label} {detailText}
                      </span>
                    </div>
                    {href && (
                      <span className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                        {messages.finance.common.open} →
                      </span>
                    )}
                  </Frame>
                );

                if (href) {
                  return (
                    <Link key={`${finding.code}-${finding.isBlocker}`} href={href}>
                      {content}
                    </Link>
                  );
                }

                return (
                  <div key={`${finding.code}-${finding.isBlocker}`}>
                    {content}
                  </div>
                );
              })}
            </div>
          </Frame>
        )}
      </div>
    </AppSection>
  );
}

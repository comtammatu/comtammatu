"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppSection, KpiRow } from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { ConfirmDialog } from "@comtammatu/ui/components/confirm-dialog";
import {
  formatPercent,
  formatAccountingVND as formatVND,
  formatCompactVND,
} from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import type { PeriodLaborCostSummary } from "../_actions/labor-cost-actions";
import { postLaborCostToExpensesAction } from "../_actions/labor-cost-actions";
import { financeHref, type FinanceParams } from "../_lib/finance-params";

const copy = messages.finance.basic.laborCost;

interface FinanceLaborCostCardProps {
  summary: PeriodLaborCostSummary | null;
  netRevenue: number;
  year: number;
  month: number;
  params: FinanceParams;
  canManageExpenses?: boolean;
}

export function FinanceLaborCostCard({
  summary,
  netRevenue,
  year,
  month,
  params,
  canManageExpenses = false,
}: FinanceLaborCostCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  if (!summary || !summary.hasPayroll) {
    return null;
  }

  const laborCost = summary.totalLaborCost;
  const ratio = netRevenue > 0 ? (laborCost / netRevenue) * 100 : null;
  const ratioTone =
    ratio == null ? "neutral" : ratio <= 22 ? "success" : "warning";
  const ratioHint =
    ratio == null ? undefined : ratio <= 22 ? copy.ratioSafe : copy.ratioHigh;

  const statusTone = summary.allPosted ? "success" : "warning";
  const statusText = summary.allPosted ? copy.statusPosted : copy.statusNotPosted;

  const handlePostExpenses = () => {
    startTransition(async () => {
      const res = await postLaborCostToExpensesAction({
        year,
        month,
        paymentMethod: "transfer",
      });
      if (!res.success) {
        toast.error(res.error ?? copy.postFailed);
        return;
      }
      toast.success(copy.postSuccess);
      setShowConfirm(false);
      router.refresh();
    });
  };

  return (
    <AppSection size="sm" title={copy.title}>
      <div className="grid gap-3">
        <KpiRow density="compact" className="grid-cols-1 sm:grid-cols-3">
          <KpiCard
            density="compact"
            label={copy.totalCost}
            value={formatVND(laborCost)}
            hint={`Lương: ${formatCompactVND(summary.totalGross)} · BH: ${formatCompactVND(summary.totalEmployerInsurance)}`}
          />
          <KpiCard
            density="compact"
            label={copy.laborCostRatio}
            value={ratio != null ? formatPercent(ratio / 100) : "—"}
            tone={ratioTone}
            hint={ratioHint}
          />
          <KpiCard
            density="compact"
            label="Trạng thái kết chuyển"
            value={statusText}
            tone={statusTone}
            hint={
              canManageExpenses && !summary.allPosted ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => setShowConfirm(true)}
                  disabled={isPending}
                >
                  {copy.postAction} →
                </Button>
              ) : (
                <Link
                  href={financeHref("/finance/expenses", params)}
                  className="text-muted-foreground underline-offset-2 hover:underline"
                >
                  {copy.viewExpenses}
                </Link>
              )
            }
          />
        </KpiRow>

        {summary.branchBreakdown.length > 0 && (
          <Frame className="grid gap-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {copy.branchBreakdownTitle}
              </p>
              {canManageExpenses && !summary.allPosted && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => setShowConfirm(true)}
                >
                  {copy.postAction}
                </Button>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {summary.branchBreakdown.map((item) => (
                <Frame
                  key={item.branchId ?? "office"}
                  className="flex items-center justify-between gap-2 p-2 text-xs"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium text-foreground">
                      {item.branchName}
                    </span>
                    <span className="text-2xs text-muted-foreground">
                      {copy.employeeCount(item.employeeCount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-foreground">
                      {formatCompactVND(item.laborCost)}
                    </span>
                    <Badge variant={item.isPosted ? "success" : "outline"}>
                      {item.isPosted ? copy.postedBadge : copy.pendingBadge}
                    </Badge>
                  </div>
                </Frame>
              ))}
            </div>
          </Frame>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={copy.postConfirmTitle}
        description={copy.postConfirmDesc(month, year)}
        confirmText={copy.postAction}
        onConfirm={handlePostExpenses}
      />
    </AppSection>
  );
}

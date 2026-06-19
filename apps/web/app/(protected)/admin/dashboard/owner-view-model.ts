import type { FinanceException } from "../../finance/_lib/finance-cockpit";
import type { BranchOperatingRow } from "./actions";

export type OwnerWorkQueueSeverity = "destructive" | "warning" | "neutral";

export type OwnerWorkQueueSource =
  | "branch"
  | "cash"
  | "food_cost"
  | "hddt"
  | "payment"
  | "supplier"
  | "expense";

export interface OwnerWorkQueueItem {
  id: string;
  severity: OwnerWorkQueueSeverity;
  title: string;
  value: string;
  description: string;
  href: string;
  actionLabel: string;
  branchId?: number;
  source: OwnerWorkQueueSource;
}

export interface OwnerDailyCommandSummary {
  branchCount: number;
  branchNeedsReview: number;
  attentionTotal: number;
}

const SEVERITY_RANK: Record<OwnerWorkQueueSeverity, number> = {
  destructive: 0,
  warning: 1,
  neutral: 2,
};

export function rankOwnerWorkQueue<T extends OwnerWorkQueueItem>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.id.localeCompare(b.id);
  });
}

export function countBranchesNeedingReview(
  rows: readonly BranchOperatingRow[],
): number {
  return rows.filter(
    (row) =>
      row.posOpenedAt === null ||
      row.printerFailed24h > 0 ||
      (row.printerHasAgent && !row.printerOnline) ||
      !row.printerHasAgent,
  ).length;
}

export function buildOwnerDailyCommandSummary({
  branchStatus,
  workQueue,
}: {
  branchStatus: readonly BranchOperatingRow[];
  workQueue: readonly OwnerWorkQueueItem[];
}): OwnerDailyCommandSummary {
  return {
    branchCount: branchStatus.length,
    branchNeedsReview: countBranchesNeedingReview(branchStatus),
    attentionTotal: workQueue.filter((item) => item.severity !== "neutral")
      .length,
  };
}

export function financeExceptionSource(
  exception: FinanceException,
): OwnerWorkQueueSource {
  if (exception.href?.includes("/finance/invoices")) return "hddt";
  if (exception.href?.includes("/finance/food-cost")) return "food_cost";
  if (exception.href?.includes("/inventory/supplier-invoices")) {
    return "supplier";
  }
  if (exception.href?.includes("/finance/expenses")) return "expense";
  return "payment";
}

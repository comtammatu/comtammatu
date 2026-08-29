import "server-only";

import { loadAuthState } from "@/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  getVNDateString,
  getVNMonthStartDateString,
} from "@comtammatu/shared/time";

export type WasteReasonBreakdownItem = {
  reasonKey: "spoiled" | "loss" | "discrepancy" | "other";
  label: string;
  totalCost: number;
  itemCount: number;
  percentage: number;
};

export type WasteShiftBreakdownItem = {
  shiftKey: string;
  label: string;
  totalCost: number;
  issueCount: number;
};

export type TopLossIngredientItem = {
  ingredientId: number;
  ingredientName: string;
  categoryName: string | null;
  totalQuantity: number;
  unitCode: string;
  totalCost: number;
  percentageOfTotal: number;
};

export type WasteAnalyticsSummary = {
  totalLossCost: number;
  totalIssueCount: number;
  selfApprovedSlipCount: number;
  totalApprovedSlipCount: number;
  selfApprovalRate: number;
  reasons: WasteReasonBreakdownItem[];
  shifts: WasteShiftBreakdownItem[];
  topLossItems: TopLossIngredientItem[];
};

export async function loadWasteAnalyticsData(options: {
  branchId?: number;
  startDate?: string;
  endDate?: string;
} = {}) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId: options.branchId,
  });

  const branchFilter = scope.selectedBranchId;
  const startDate = options.startDate ?? getVNMonthStartDateString();
  const endDate = options.endDate ?? getVNDateString();

  // 1. Fetch writeoff issues
  let issuesQuery = supabase
    .from("stock_issues")
    .select(
      `
      id,
      branch_id,
      shift_key,
      issued_at,
      approval_status,
      stock_issue_items (
        id,
        ingredient_id,
        quantity,
        total_cost,
        entry_unit_code,
        reason_code,
        reason,
        ingredient:ingredients (
          id,
          name,
          category:ingredient_categories(name)
        )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("issue_type", "writeoff")
    .gte("issued_at", `${startDate}T00:00:00+07:00`)
    .lte("issued_at", `${endDate}T23:59:59+07:00`);

  if (branchFilter !== null) {
    issuesQuery = issuesQuery.eq("branch_id", branchFilter);
  }

  const { data: issues, error: issuesError } = await issuesQuery;

  if (issuesError || !issues) {
    return {
      loadFailed: true,
      data: null,
    };
  }

  // 2. Fetch count slips self-approval rate
  let slipsQuery = supabase
    .from("inventory_count_slips")
    .select("id, is_self_approved, status")
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "approved")
    .gte("counted_at", `${startDate}T00:00:00+07:00`)
    .lte("counted_at", `${endDate}T23:59:59+07:00`);

  if (branchFilter !== null) {
    slipsQuery = slipsQuery.eq("branch_id", branchFilter);
  }

  const { data: countSlips } = await slipsQuery;
  const totalApprovedSlips = countSlips?.length ?? 0;
  const selfApprovedSlips =
    countSlips?.filter((s) => s.is_self_approved).length ?? 0;
  const selfApprovalRate =
    totalApprovedSlips > 0 ? selfApprovedSlips / totalApprovedSlips : 0;

  // 3. Aggregate data
  let totalLossCost = 0;
  const totalIssueCount = issues.length;

  const reasonTotals: Record<
    "spoiled" | "loss" | "discrepancy" | "other",
    { cost: number; count: number }
  > = {
    spoiled: { cost: 0, count: 0 },
    loss: { cost: 0, count: 0 },
    discrepancy: { cost: 0, count: 0 },
    other: { cost: 0, count: 0 },
  };

  const shiftTotals = new Map<string, { cost: number; count: number }>();
  const ingredientTotals = new Map<
    number,
    {
      name: string;
      category: string | null;
      qty: number;
      unit: string;
      cost: number;
    }
  >();

  for (const issue of issues) {
    const shiftKey = issue.shift_key || "Ca thường";
    const shiftData = shiftTotals.get(shiftKey) ?? { cost: 0, count: 0 };
    shiftData.count += 1;

    const items = issue.stock_issue_items ?? [];
    for (const item of items) {
      const cost = Number(item.total_cost ?? 0);
      const qty = Number(item.quantity ?? 0);
      const unit = item.entry_unit_code || "đv";
      totalLossCost += cost;
      shiftData.cost += cost;

      // Group reason
      const code = item.reason_code ?? "";
      let groupKey: "spoiled" | "loss" | "discrepancy" | "other" = "other";
      if (code === "spoiled" || code === "expired" || code === "damaged") {
        groupKey = "spoiled";
      } else if (code === "loss") {
        groupKey = "loss";
      } else if (code === "discrepancy" || code === "count_error") {
        groupKey = "discrepancy";
      }
      reasonTotals[groupKey].cost += cost;
      reasonTotals[groupKey].count += 1;

      // Group ingredient
      const ingId = item.ingredient_id;
      const ingObj = item.ingredient as unknown as {
        name?: string;
        category?: { name?: string } | null;
      } | null;
      const ingName = ingObj?.name ?? `Nguyên liệu #${ingId}`;
      const catName = ingObj?.category?.name ?? null;

      const ingData = ingredientTotals.get(ingId) ?? {
        name: ingName,
        category: catName,
        qty: 0,
        unit,
        cost: 0,
      };
      ingData.qty += qty;
      ingData.cost += cost;
      ingredientTotals.set(ingId, ingData);
    }

    shiftTotals.set(shiftKey, shiftData);
  }

  // Build reasons breakdown
  const reasons: WasteReasonBreakdownItem[] = [
    {
      reasonKey: "spoiled",
      label: INVENTORY_VI.wasteAnalyticsReasonSpoiled,
      totalCost: reasonTotals.spoiled.cost,
      itemCount: reasonTotals.spoiled.count,
      percentage:
        totalLossCost > 0 ? reasonTotals.spoiled.cost / totalLossCost : 0,
    },
    {
      reasonKey: "loss",
      label: INVENTORY_VI.wasteAnalyticsReasonLoss,
      totalCost: reasonTotals.loss.cost,
      itemCount: reasonTotals.loss.count,
      percentage:
        totalLossCost > 0 ? reasonTotals.loss.cost / totalLossCost : 0,
    },
    {
      reasonKey: "discrepancy",
      label: INVENTORY_VI.wasteAnalyticsReasonDiscrepancy,
      totalCost: reasonTotals.discrepancy.cost,
      itemCount: reasonTotals.discrepancy.count,
      percentage:
        totalLossCost > 0 ? reasonTotals.discrepancy.cost / totalLossCost : 0,
    },
    {
      reasonKey: "other",
      label: INVENTORY_VI.wasteAnalyticsReasonOther,
      totalCost: reasonTotals.other.cost,
      itemCount: reasonTotals.other.count,
      percentage:
        totalLossCost > 0 ? reasonTotals.other.cost / totalLossCost : 0,
    },
  ];

  // Build shifts breakdown
  const shifts: WasteShiftBreakdownItem[] = Array.from(shiftTotals.entries())
    .map(([shiftKey, val]) => ({
      shiftKey,
      label: shiftKey,
      totalCost: val.cost,
      issueCount: val.count,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  // Build top loss items
  const topLossItems: TopLossIngredientItem[] = Array.from(
    ingredientTotals.entries(),
  )
    .map(([id, val]) => ({
      ingredientId: id,
      ingredientName: val.name,
      categoryName: val.category,
      totalQuantity: val.qty,
      unitCode: val.unit,
      totalCost: val.cost,
      percentageOfTotal: totalLossCost > 0 ? val.cost / totalLossCost : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 10);

  const summary: WasteAnalyticsSummary = {
    totalLossCost,
    totalIssueCount,
    selfApprovedSlipCount: selfApprovedSlips,
    totalApprovedSlipCount: totalApprovedSlips,
    selfApprovalRate,
    reasons,
    shifts,
    topLossItems,
  };

  return {
    loadFailed: false,
    data: summary,
  };
}

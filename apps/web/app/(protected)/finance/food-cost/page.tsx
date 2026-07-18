import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchFoodCost } from "@/_lib/food-cost-actions";
import { fetchAccessibleBranches, fetchRevenueKpis } from "../actions";
import { fetchActualFoodCostSummary } from "../expense-actions";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "../_lib/finance-params";
import { FoodCostClient } from "./food-cost-client";
import type { FoodCostRow } from "./_types";

export default async function FoodCostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseFinanceParams(sp);
  const resolved = resolveFinanceRange(params);

  const [branchesRes, foodRes, actualRes, revenueRes] = await Promise.all([
    fetchAccessibleBranches(),
    fetchFoodCost({
      startDate: resolved.start,
      endDate: resolved.end,
      ...(params.branch != null ? { branchId: params.branch } : {}),
    }),
    fetchActualFoodCostSummary({
      startDate: resolved.start,
      endDate: resolved.end,
      ...(params.branch != null ? { branchId: params.branch } : {}),
    }),
    fetchRevenueKpis(params.branch, resolved.start, resolved.end),
  ]);

  const branches = (branchesRes.success ? (branchesRes.data ?? []) : []) as {
    id: number;
    name: string;
  }[];
  const rows = (foodRes.success ? (foodRes.data ?? []) : []) as FoodCostRow[];
  const actualSummary = actualRes.success
    ? (actualRes.data ?? { total: 0, orderCount: 0 })
    : { total: 0, orderCount: 0 };
  const revenueKpis = revenueRes.success
    ? (revenueRes.data as { order_count?: number | null } | null)
    : null;

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={messages.finance.foodCost.eyebrow}
        title={messages.finance.nav.items.foodCost}
        description={messages.finance.foodCost.description}
        meta={messages.finance.basic.periodMeta(resolved.start, resolved.end)}
      />
      <FoodCostClient
        params={params}
        branches={branches}
        rows={rows}
        actualFoodCost={actualSummary.total}
        coveredOrderCount={actualSummary.orderCount}
        totalOrderCount={Number(revenueKpis?.order_count ?? 0)}
      />
    </AppPage>
  );
}

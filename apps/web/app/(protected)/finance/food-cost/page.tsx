import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
} from "@/components/surface";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { fetchFoodCost } from "@/_lib/food-cost-actions";
import { fetchAccessibleBranches, fetchRevenueKpis } from "../actions";
import { fetchActualFoodCostSummary } from "../expense-actions";
import { calculateGrossProfitIdentity } from "../_lib/finance-result";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "../_lib/finance-params";
import { FoodCostClient } from "./food-cost-client";
import type { FoodCostRow } from "./_types";

type RevenueKpiRow = {
  subtotal_revenue?: number | string | null;
  discount_amount?: number | string | null;
  order_count?: number | string | null;
};

const EMPTY_ACTUAL = {
  total: 0,
  operatingConsumption: 0,
  orderCount: 0,
} as const;

const EMPTY_REVENUE = {
  subtotal_revenue: 0,
  discount_amount: 0,
  order_count: 0,
} as const;

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
    ? (actualRes.data ?? EMPTY_ACTUAL)
    : EMPTY_ACTUAL;
  const revenueKpis = revenueRes.success
    ? ((revenueRes.data ?? EMPTY_REVENUE) as RevenueKpiRow)
    : null;
  const paidOrderCount = Number(revenueKpis?.order_count ?? 0);
  const netRevenueBeforeVat =
    Number(revenueKpis?.subtotal_revenue ?? 0) -
    Number(revenueKpis?.discount_amount ?? 0);
  const grossMarginPct =
    revenueKpis == null ||
    !Number.isFinite(paidOrderCount) ||
    !Number.isFinite(netRevenueBeforeVat)
      ? null
      : calculateGrossProfitIdentity({
          netRevenueBeforeVat,
          ingredientCost: actualSummary.total,
          costAvailable:
            paidOrderCount === 0 || actualSummary.orderCount >= paidOrderCount,
        }).grossMargin;
  const loadFailed =
    !branchesRes.success ||
    !foodRes.success ||
    !actualRes.success ||
    !revenueRes.success;

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader title={messages.finance.nav.items.foodCost} />
      {loadFailed ? (
        <AppEmptyState
          mode="error"
          title={ERRORS_VI.loadFailed}
          description={ERRORS_VI.fallback}
        />
      ) : (
        <FoodCostClient
          params={params}
          branches={branches}
          rows={rows}
          actualFoodCost={actualSummary.total}
          grossMarginPct={grossMarginPct}
        />
      )}
    </AppPage>
  );
}

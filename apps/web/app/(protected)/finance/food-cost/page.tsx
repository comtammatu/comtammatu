import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
} from "@/components/surface";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { fetchFoodCost } from "@/_lib/food-cost-actions";
import { fetchAccessibleBranches } from "../actions";
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

  const [branchesRes, foodRes, actualRes] = await Promise.all([
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
  ]);

  const branches = (branchesRes.success ? (branchesRes.data ?? []) : []) as {
    id: number;
    name: string;
  }[];
  const rows = (foodRes.success ? (foodRes.data ?? []) : []) as FoodCostRow[];
  const actualSummary = actualRes.success
    ? (actualRes.data ?? { total: 0 })
    : { total: 0 };
  const loadFailed =
    !branchesRes.success || !foodRes.success || !actualRes.success;

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
        />
      )}
    </AppPage>
  );
}

import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchFoodCost } from "../accounting-actions";
import { fetchAccessibleBranches } from "../actions";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "../_lib/finance-params";
import { FoodCostClient } from "./food-cost-client";

export interface FoodCostRow {
  period_start: string | null;
  branch_id: number | null;
  menu_item_id: number | null;
  item_name: string | null;
  quantity_sold: number | null;
  revenue: number | null;
  ingredient_cost: number | null;
  food_cost_pct: number | null;
}

export default async function FoodCostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseFinanceParams(sp);
  const resolved = resolveFinanceRange(params);

  const [branchesRes, foodRes] = await Promise.all([
    fetchAccessibleBranches(),
    fetchFoodCost({
      startDate: resolved.start,
      endDate: resolved.end,
      ...(params.branch != null ? { branchId: params.branch } : {}),
    }),
  ]);

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as { id: number; name: string }[];
  const rows = (foodRes.success ? (foodRes.data ?? []) : []) as FoodCostRow[];

  return (
    <AppPage>
      <AppPageHeader
        eyebrow={messages.finance.shell.subLabel}
        title={messages.finance.nav.items.foodCost}
      />
      <FoodCostClient
        params={params}
        branches={branches}
        rows={rows}
        resolvedStart={resolved.start}
        resolvedEnd={resolved.end}
      />
    </AppPage>
  );
}

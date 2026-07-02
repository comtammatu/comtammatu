import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchFoodCost } from "@/_lib/food-cost-actions";
import { fetchAccessibleBranches } from "../actions";
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

  const [branchesRes, foodRes] = await Promise.all([
    fetchAccessibleBranches(),
    fetchFoodCost({
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

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={messages.finance.shell.subLabel}
        title={messages.finance.nav.items.foodCost}
        description={messages.finance.foodCost.estimateNote}
        meta={messages.finance.basic.periodMeta(resolved.start, resolved.end)}
      />
      <FoodCostClient params={params} branches={branches} rows={rows} />
    </AppPage>
  );
}

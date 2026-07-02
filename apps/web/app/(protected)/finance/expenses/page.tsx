import { getVNDateString } from "@comtammatu/shared/time";
import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchAccessibleBranches } from "../actions";
import { fetchActualFoodCostTotal, fetchExpenses } from "../expense-actions";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "../_lib/finance-params";
import { ExpensesClient } from "./expenses-client";

const copy = messages.finance.expenses;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseFinanceParams(sp);
  const resolved = resolveFinanceRange(params);

  const [branchesRes, expensesRes, foodCostRes] = await Promise.all([
    fetchAccessibleBranches(),
    fetchExpenses({
      startDate: resolved.start,
      endDate: resolved.end,
      ...(params.branch != null ? { branchId: params.branch } : {}),
    }),
    fetchActualFoodCostTotal({
      startDate: resolved.start,
      endDate: resolved.end,
      ...(params.branch != null ? { branchId: params.branch } : {}),
    }),
  ]);

  const branches = (branchesRes.success ? (branchesRes.data ?? []) : []) as {
    id: number;
    name: string;
  }[];
  const rows = expensesRes.success ? (expensesRes.data ?? []) : [];
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const actualFoodCost = foodCostRes.success ? (foodCostRes.data ?? 0) : 0;
  const todayBusinessDate = getVNDateString();

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={copy.page.eyebrow}
        title={copy.page.title}
        description={copy.page.description}
        meta={messages.finance.basic.periodMeta(resolved.start, resolved.end)}
      />
      <ExpensesClient
        params={params}
        branches={branches}
        rows={rows}
        totalAmount={totalAmount}
        actualFoodCost={actualFoodCost}
        resolvedStart={resolved.start}
        resolvedEnd={resolved.end}
        todayBusinessDate={todayBusinessDate}
      />
    </AppPage>
  );
}

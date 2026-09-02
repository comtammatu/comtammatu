import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getVNDateString } from "@comtammatu/shared/time";
import { AppPage } from "@/components/surface";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { loadAuthState } from "@/_lib/auth";
import { fetchAccessibleBranches } from "../actions";
import {
  fetchExpenseById,
  fetchExpensePeriodSummary,
  fetchExpenses,
  fetchStartupCapitalSummary,
} from "../expense-actions";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "../_lib/finance-params";
import { ExpensesClient } from "./expenses-client";
import { parseExpenseListState } from "./expense-list-state";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseFinanceParams(sp);
  const resolved = resolveFinanceRange(params);

  const rawExpenseId = Array.isArray(sp.expenseId)
    ? sp.expenseId[0]
    : sp.expenseId;
  const targetExpenseId =
    rawExpenseId &&
    Number.isInteger(Number(rawExpenseId)) &&
    Number(rawExpenseId) > 0
      ? Number(rawExpenseId)
      : null;

  // Settle cookie session before parallel getAuthContext fan-out.
  // Racing loadAuthState with finance actions on the shared GoTrue client
  // yields false-null ctx and the expenses soft load-error empty state.
  const { claims } = await loadAuthState();
  const [
    branchesRes,
    expensesRes,
    summaryRes,
    startupRes,
    canManageExpenses,
    targetExpenseRes,
  ] = await Promise.all([
    fetchAccessibleBranches(),
    fetchExpenses({
      location: params.location,
      startDate: resolved.start,
      endDate: resolved.end,
      ...(params.branch != null ? { branchId: params.branch } : {}),
    }),
    fetchExpensePeriodSummary({
      location: params.location,
      startDate: resolved.start,
      endDate: resolved.end,
      ...(params.branch != null ? { branchId: params.branch } : {}),
    }),
    fetchStartupCapitalSummary({
      location: params.location,
      ...(params.branch != null ? { branchId: params.branch } : {}),
    }),
    currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_EXPENSE_CREATE),
    targetExpenseId != null
      ? fetchExpenseById(targetExpenseId)
      : Promise.resolve({ success: true, data: null }),
  ]);

  if (
    !branchesRes.success ||
    !expensesRes.success ||
    !summaryRes.success ||
    !startupRes.success ||
    summaryRes.data == null
  ) {
    throw new Error("Failed to load finance expenses page data.");
  }

  const branches = (branchesRes.data ?? []) as {
    id: number;
    name: string;
  }[];
  let rows = expensesRes.data ?? [];
  if (
    targetExpenseRes?.success &&
    targetExpenseRes.data &&
    !rows.some((row) => row.id === targetExpenseRes.data!.id)
  ) {
    rows = [targetExpenseRes.data, ...rows];
  }
  const periodSummary = summaryRes.data;
  const summary = {
    operatingTotal: periodSummary.operatingTotal,
    operatingCount: periodSummary.operatingCount,
    startupTotal: startupRes.data?.total ?? "0.00",
    startupCount: startupRes.data?.count ?? 0,
    needsActionTotal: periodSummary.needsActionTotal,
    needsActionCount: periodSummary.needsActionCount,
  };
  const todayBusinessDate = getVNDateString();

  return (
    <AppPage width="xwide" density="compact">
      <ExpensesClient
        params={params}
        branches={branches}
        rows={rows}
        summary={summary}
        stateFilter={parseExpenseListState(sp.state)}
        todayBusinessDate={todayBusinessDate}
        canManageExpenses={canManageExpenses}
        tenantId={claims.tenant_id}
      />
    </AppPage>
  );
}

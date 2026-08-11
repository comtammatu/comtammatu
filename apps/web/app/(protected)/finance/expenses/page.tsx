import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { addMoney } from "@comtammatu/shared/money";
import { getVNDateString } from "@comtammatu/shared/time";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { fetchAccessibleBranches } from "../actions";
import { fetchExpenseById, fetchExpenses } from "../expense-actions";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "../_lib/finance-params";
import {
  expenseNeedsAction,
  isOperatingExpenseCategory,
} from "../_lib/expense-categories";
import { ExpensesClient } from "./expenses-client";
import { parseExpenseListState } from "./expense-list-state";

const copy = messages.finance.expenses;

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
  const [branchesRes, expensesRes, canManageExpenses, targetExpenseRes] =
    await Promise.all([
      fetchAccessibleBranches(),
      fetchExpenses({
        location: params.location,
        startDate: resolved.start,
        endDate: resolved.end,
        ...(params.branch != null ? { branchId: params.branch } : {}),
      }),
      currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_EXPENSE_CREATE),
      targetExpenseId != null
        ? fetchExpenseById(targetExpenseId)
        : Promise.resolve({ success: true, data: null }),
    ]);

  if (!branchesRes.success || !expensesRes.success) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader
          title={copy.page.title}
          meta={messages.finance.basic.periodMeta(resolved.start, resolved.end)}
        />
        <AppEmptyState
          mode="error"
          title={copy.loadErrorTitle}
          description={copy.loadErrorDescription}
        />
      </AppPage>
    );
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
  const summary = rows.reduce(
    (acc, row) => {
      if (isOperatingExpenseCategory(row.category)) {
        acc.operatingTotal = addMoney([
          acc.operatingTotal,
          String(row.subtotal),
        ]);
        acc.operatingCount += 1;
      }
      if (expenseNeedsAction(row)) {
        acc.needsActionTotal = addMoney([
          acc.needsActionTotal,
          String(row.amount),
        ]);
        acc.needsActionCount += 1;
      }
      return acc;
    },
    {
      operatingTotal: "0.00",
      operatingCount: 0,
      needsActionTotal: "0.00",
      needsActionCount: 0,
    },
  );
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

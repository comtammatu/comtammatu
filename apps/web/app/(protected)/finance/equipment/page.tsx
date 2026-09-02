import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getVNDateString } from "@comtammatu/shared/time";
import { AppPage } from "@/components/surface";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { loadAuthState } from "@/_lib/auth";
import { fetchAccessibleBranches } from "../actions";
import {
  fetchEquipmentExpenses,
  fetchExpenseById,
  fetchStartupCapitalSummary,
} from "../expense-actions";
import { parseFinanceParams } from "../_lib/finance-params";
import { ExpensesClient } from "../expenses/expenses-client";
import { parseExpenseListState } from "../expenses/expense-list-state";

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseFinanceParams(sp);

  const rawExpenseId = Array.isArray(sp.expenseId)
    ? sp.expenseId[0]
    : sp.expenseId;
  const targetExpenseId =
    rawExpenseId &&
    Number.isInteger(Number(rawExpenseId)) &&
    Number(rawExpenseId) > 0
      ? Number(rawExpenseId)
      : null;

  const { claims } = await loadAuthState();
  const [
    branchesRes,
    expensesRes,
    startupRes,
    canManageExpenses,
    targetExpenseRes,
  ] = await Promise.all([
    fetchAccessibleBranches(),
    fetchEquipmentExpenses({
      location: params.location,
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

  if (!branchesRes.success || !expensesRes.success || !startupRes.success) {
    throw new Error("Failed to load finance equipment page data.");
  }

  const branches = (branchesRes.data ?? []) as {
    id: number;
    name: string;
  }[];
  let rows = expensesRes.data ?? [];
  if (
    targetExpenseRes?.success &&
    targetExpenseRes.data &&
    targetExpenseRes.data.category === "capital" &&
    !rows.some((row) => row.id === targetExpenseRes.data!.id)
  ) {
    rows = [targetExpenseRes.data, ...rows];
  }
  const summary = {
    operatingTotal: "0.00",
    operatingCount: 0,
    startupTotal: startupRes.data?.equipmentTotal ?? "0.00",
    startupCount: startupRes.data?.equipmentCount ?? 0,
    needsActionTotal: "0.00",
    needsActionCount: 0,
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
        listMode="equipment"
      />
    </AppPage>
  );
}

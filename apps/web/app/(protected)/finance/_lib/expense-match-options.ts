import "server-only";

import { loadAuthState } from "@/_lib/auth";
import { EXPENSE_CATEGORIES_BY_GROUP } from "./expense-categories";

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

export interface ExpenseRow {
  id: number;
  branch_id: number | null;
  expense_date: string;
  category: string;
  amount: number;
  payment_method: string;
  paid_at: string | null;
  transfer_content: string | null;
  vendor_name: string | null;
  note: string | null;
  created_at: string;
  matchedEventIds: number[];
  matchedBankTransactionIds: number[];
}

export type ExpenseMatchOption = ExpenseRow;

interface ExpenseMatchRow {
  webhook_event_id: number;
  expense_id: number;
}

interface WebhookExpenseMatchRow {
  id: number;
  expense_id: number | null;
}

interface CanonicalExpenseMatchRow {
  bank_transaction_id: number;
  expense_id: number;
}

function isExpenseMatchSchemaMissing(code?: string): boolean {
  return code === "PGRST202" || code === "PGRST205" || code === "42P01";
}

export async function fetchExpenseMatchMap(
  supabase: SupabaseClient,
  tenantId: number,
  expenseIds?: readonly number[],
): Promise<Map<number, number[]>> {
  const matchedByExpense = new Map<number, Set<number>>();
  const addMatch = (expenseId: number, eventId: number) => {
    const current = matchedByExpense.get(expenseId) ?? new Set<number>();
    current.add(eventId);
    matchedByExpense.set(expenseId, current);
  };
  const toEventIdMap = () =>
    new Map(
      Array.from(matchedByExpense, ([expenseId, eventIds]) => [
        expenseId,
        Array.from(eventIds),
      ]),
    );
  if (expenseIds?.length === 0) return new Map();

  const idBatches: Array<readonly number[] | null> =
    expenseIds == null
      ? [null]
      : Array.from({ length: Math.ceil(expenseIds.length / 500) }, (_, index) =>
          expenseIds.slice(index * 500, (index + 1) * 500),
        );
  const resultPageSize = 1_000;
  let matchSchemaAvailable = true;

  for (const idBatch of idBatches) {
    if (!matchSchemaAvailable) break;
    for (let offset = 0; ; offset += resultPageSize) {
      let matchQuery = supabase
        .from("bank_transaction_expense_matches")
        .select("webhook_event_id, expense_id")
        .eq("tenant_id", tenantId)
        .range(offset, offset + resultPageSize - 1);
      if (idBatch != null) {
        matchQuery = matchQuery.in("expense_id", [...idBatch]);
      }
      const { data: matchRows, error: matchErr } = await matchQuery;

      if (matchErr) {
        if (isExpenseMatchSchemaMissing(matchErr.code)) {
          matchSchemaAvailable = false;
          break;
        }
        console.error(
          "[finance:expense-match] failed to load bank_transaction_expense_matches",
          matchErr.code,
        );
        throw new Error("Unable to load bank transaction expense matches");
      }

      for (const row of (matchRows ?? []) as ExpenseMatchRow[]) {
        addMatch(row.expense_id, row.webhook_event_id);
      }
      if ((matchRows?.length ?? 0) < resultPageSize) break;
    }
  }

  for (const idBatch of idBatches) {
    for (let offset = 0; ; offset += resultPageSize) {
      let webhookQuery = supabase
        .from("webhook_events")
        .select("id, expense_id")
        .eq("tenant_id", tenantId)
        .eq("provider", "sepay")
        .not("expense_id", "is", null)
        .range(offset, offset + resultPageSize - 1);
      if (idBatch != null) {
        webhookQuery = webhookQuery.in("expense_id", [...idBatch]);
      }
      const { data: webhookRows, error: webhookErr } = await webhookQuery;

      if (webhookErr) {
        console.error(
          "[finance:expense-match] failed to load webhook_event expense matches",
          webhookErr.code,
        );
        throw new Error("Unable to load webhook expense matches");
      }

      for (const row of (webhookRows ?? []) as WebhookExpenseMatchRow[]) {
        if (row.expense_id != null) {
          addMatch(row.expense_id, row.id);
        }
      }
      if ((webhookRows?.length ?? 0) < resultPageSize) break;
    }
  }

  return toEventIdMap();
}

export async function fetchExpenseBankTransactionMatchMap(
  supabase: SupabaseClient,
  tenantId: number,
  expenseIds: readonly number[],
): Promise<Map<number, number[]>> {
  if (expenseIds.length === 0) return new Map();

  const matchedByExpense = new Map<number, number[]>();
  for (let index = 0; index < expenseIds.length; index += 500) {
    const batch = expenseIds.slice(index, index + 500);
    const { data, error } = await supabase
      .from("bank_transaction_reconciliation_matches")
      .select("bank_transaction_id, expense_id")
      .eq("tenant_id", tenantId)
      .in("expense_id", [...batch])
      .order("expense_id", { ascending: true })
      .order("bank_transaction_id", { ascending: true });

    if (error) {
      if (isExpenseMatchSchemaMissing(error.code)) return new Map();
      console.error(
        "[finance:expense-match] failed to load canonical expense matches",
        error.code,
      );
      throw new Error("Unable to load canonical expense matches");
    }

    for (const row of (data ?? []) as CanonicalExpenseMatchRow[]) {
      const current = matchedByExpense.get(row.expense_id) ?? [];
      current.push(row.bank_transaction_id);
      matchedByExpense.set(row.expense_id, current);
    }
  }

  return matchedByExpense;
}

export async function loadExpenseMatchOptions(
  includeExpenseIds: readonly number[],
): Promise<ExpenseMatchOption[]> {
  const { supabase, claims } = await loadAuthState();
  const requestedExpenseIds = Array.from(new Set(includeExpenseIds));

  const { data: candidateRows, error } = await supabase
    .from("expenses")
    .select(
      "id, branch_id, expense_date, category, amount, payment_method, paid_at, transfer_content, vendor_name, note, created_at",
    )
    .eq("tenant_id", claims.tenant_id)
    .in("category", [...EXPENSE_CATEGORIES_BY_GROUP.operating])
    .or(
      "payment_method.eq.unpaid,payment_method.eq.transfer,transfer_content.not.is.null",
    )
    .order("expense_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(150);

  if (error) {
    console.error(
      "[finance:expense-match] failed to load candidate expenses",
      error.code,
    );
    throw new Error("Unable to load expense match candidates");
  }

  let includedRows: NonNullable<typeof candidateRows> = [];
  if (requestedExpenseIds.length > 0) {
    const includedResult = await supabase
      .from("expenses")
      .select(
        "id, branch_id, expense_date, category, amount, payment_method, paid_at, transfer_content, vendor_name, note, created_at",
      )
      .eq("tenant_id", claims.tenant_id)
      .in("category", [...EXPENSE_CATEGORIES_BY_GROUP.operating])
      .in("id", requestedExpenseIds);

    if (includedResult.error) {
      console.error(
        "[finance:expense-match] failed to load included expenses",
        includedResult.error.code,
      );
      throw new Error("Unable to load matched expense options");
    }
    includedRows = includedResult.data ?? [];
  }

  const rowsById = new Map(
    (candidateRows ?? []).map((row) => [row.id, row] as const),
  );
  for (const row of includedRows) rowsById.set(row.id, row);
  const rows = Array.from(rowsById.values());
  const expenseIds = rows.map((row) => row.id);
  const [matchedByExpense, matchedByBankTransaction] = await Promise.all([
    fetchExpenseMatchMap(supabase, claims.tenant_id, expenseIds),
    fetchExpenseBankTransactionMatchMap(
      supabase,
      claims.tenant_id,
      expenseIds,
    ),
  ]);

  return rows.map((row) => ({
    id: row.id,
    branch_id: row.branch_id,
    expense_date: row.expense_date,
    category: row.category,
    amount: Number(row.amount),
    payment_method: row.payment_method,
    paid_at: row.paid_at,
    transfer_content: row.transfer_content,
    vendor_name: row.vendor_name,
    note: row.note,
    created_at: row.created_at,
    matchedEventIds: matchedByExpense.get(row.id) ?? [],
    matchedBankTransactionIds:
      matchedByBankTransaction.get(row.id) ?? [],
  }));
}

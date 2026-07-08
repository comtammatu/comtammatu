import { loadAuthState } from "@/_lib/auth";
import {
  mapSepayWebhookRow,
  sumSepayBankMovementSince,
  type SepayBankTransaction,
  type SepayWebhookRow,
} from "./sepay-bank-transaction-model";

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

interface SepayExpenseMatchRow {
  webhook_event_id: number;
  expense_id: number;
}

const SEPAY_WEBHOOK_SELECT =
  "id, request_id, created_at, processing_status, error_code, payment_id, expense_id, payload" as const;

// ponytail: scan existing webhook ledger; add a bank_transactions table if this pilot account outgrows 5000 retained SePay rows.
const SEPAY_BALANCE_SCAN_LIMIT = 5000;
const SEPAY_TRANSACTION_LIST_LIMIT = 100;

function isExpenseMatchSchemaMissing(code?: string): boolean {
  return code === "PGRST205" || code === "42P01";
}

async function fetchSepayWebhookRows(
  supabase: SupabaseClient,
  tenantId: number,
  limit: number,
): Promise<SepayWebhookRow[]> {
  const { data, error } = await supabase
    .from("webhook_events")
    .select(SEPAY_WEBHOOK_SELECT)
    .eq("tenant_id", tenantId)
    .in("provider", ["sepay", "manual"])
    .eq("signature_valid", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(
      "[finance:sepay-bank] failed to load webhook_events",
      error.code,
    );
    return [];
  }

  return (data ?? []) as SepayWebhookRow[];
}

async function fetchSepayExpenseMatches(
  supabase: SupabaseClient,
  tenantId: number,
  eventIds: number[],
): Promise<Map<number, number[]>> {
  if (eventIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("bank_transaction_expense_matches")
    .select("webhook_event_id, expense_id")
    .eq("tenant_id", tenantId)
    .in("webhook_event_id", eventIds);

  if (error) {
    if (isExpenseMatchSchemaMissing(error.code)) return new Map();
    console.error(
      "[finance:sepay-bank] failed to load bank_transaction_expense_matches",
      error.code,
    );
    return new Map();
  }

  const matches = new Map<number, number[]>();
  for (const row of (data ?? []) as SepayExpenseMatchRow[]) {
    const ids = matches.get(row.webhook_event_id) ?? [];
    ids.push(row.expense_id);
    matches.set(row.webhook_event_id, ids);
  }
  return matches;
}

export async function fetchSepayBankMovementSince(
  supabase: SupabaseClient,
  tenantId: number,
  sinceDate: string,
) {
  const rows = await fetchSepayWebhookRows(
    supabase,
    tenantId,
    SEPAY_BALANCE_SCAN_LIMIT,
  );
  return sumSepayBankMovementSince(rows, sinceDate);
}

export async function fetchSepayBankTransactions(): Promise<
  SepayBankTransaction[]
> {
  const { supabase, claims } = await loadAuthState();
  const rows = await fetchSepayWebhookRows(
    supabase,
    claims.tenant_id,
    SEPAY_TRANSACTION_LIST_LIMIT,
  );
  const transactions = rows
    .map(mapSepayWebhookRow)
    .filter((tx): tx is SepayBankTransaction => tx !== null);
  const matches = await fetchSepayExpenseMatches(
    supabase,
    claims.tenant_id,
    transactions.map((tx) => tx.eventId),
  );

  return transactions.map((tx) => {
    const expenseIds = matches.get(tx.eventId);
    if (!expenseIds?.length) return tx;
    return {
      ...tx,
      expenseId: expenseIds[0] ?? tx.expenseId,
      expenseIds,
    };
  });
}

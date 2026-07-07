import { loadAuthState } from "@/_lib/auth";
import {
  mapSepayWebhookRow,
  sumSepayBankMovementSince,
  type SepayBankTransaction,
  type SepayWebhookRow,
} from "./sepay-bank-transaction-model";

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

const SEPAY_WEBHOOK_SELECT =
  "id, request_id, created_at, processing_status, error_code, payment_id, expense_id, payload" as const;

// ponytail: scan existing webhook ledger; add a bank_transactions table if this pilot account outgrows 5000 retained SePay rows.
const SEPAY_BALANCE_SCAN_LIMIT = 5000;
const SEPAY_TRANSACTION_LIST_LIMIT = 100;

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
  return rows
    .map(mapSepayWebhookRow)
    .filter((tx): tx is SepayBankTransaction => tx !== null);
}

import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import { loadAuthState } from "@/_lib/auth";
import {
  attachSupplierPaymentMatches,
  buildSepayPaymentWebhookSummary,
  isSepayBusinessDateInRange,
  isSepayTransactionInDateRange,
  mapSepayWebhookRow,
  readSepayBankWebhookReview,
  sumSepayBankMovementSince,
  type SepayBankTransaction,
  type SepayDateRange,
  type SepayPaymentWebhookCheck,
  type SepayPaymentWebhookSummary,
  type SepaySupplierPaymentMatch,
  type SepayWebhookRow,
} from "./sepay-bank-transaction-model";

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

interface SepayExpenseMatchRow {
  webhook_event_id: number;
  expense_id: number;
}

interface SepayPaymentRow {
  id: number;
  order_id: number | null;
  amount: number;
  paid_at: string | null;
  provider_ref: string | null;
  provider_data: unknown;
}

interface SupplierPaymentRow {
  id: number;
  supplier_invoice_id: number;
  amount: number;
  payment_date: string;
  reference_note: string | null;
  supplier_invoices?:
    | {
        invoice_number?: string | null;
        suppliers?:
          | { name?: string | null }
          | { name?: string | null }[]
          | null;
      }
    | {
        invoice_number?: string | null;
        suppliers?:
          | { name?: string | null }
          | { name?: string | null }[]
          | null;
      }[]
    | null;
}

const SEPAY_WEBHOOK_SELECT =
  "id, request_id, created_at, processing_status, error_code, payment_id, expense_id, payload" as const;

// ponytail: scan existing webhook ledger; add a bank_transactions table if this pilot account outgrows 5000 retained SePay rows.
const SEPAY_BALANCE_SCAN_LIMIT = 5000;
const SEPAY_TRANSACTION_LIST_LIMIT = 100;
const SEPAY_PAYMENT_WEBHOOK_CHECK_LIMIT = 100;

function isExpenseMatchSchemaMissing(code?: string): boolean {
  return code === "PGRST205" || code === "42P01";
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

async function fetchSepayWebhookRows(
  supabase: SupabaseClient,
  tenantId: number,
  limit: number,
  range?: SepayDateRange,
): Promise<SepayWebhookRow[]> {
  const query = supabase
    .from("webhook_events")
    .select(SEPAY_WEBHOOK_SELECT)
    .eq("tenant_id", tenantId)
    .in("provider", ["sepay", "manual"])
    .eq("signature_valid", true);
  const rangedQuery = range
    ? query
        .gte("created_at", getVNDayUtcRange(range.start).startIso)
        .lt("created_at", getVNDayUtcRange(range.end).endIso)
    : query;
  const { data, error } = await rangedQuery
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

async function fetchSupplierPaymentMatches(
  supabase: SupabaseClient,
  tenantId: number,
  range?: SepayDateRange,
): Promise<SepaySupplierPaymentMatch[]> {
  const query = supabase
    .from("supplier_payments")
    .select(
      "id, supplier_invoice_id, amount, payment_date, reference_note, supplier_invoices ( invoice_number, suppliers ( name ) )",
    )
    .eq("tenant_id", tenantId)
    .eq("payment_method", "bank_transfer");
  const rangedQuery = range
    ? query
        .gte("payment_date", getVNDayUtcRange(range.start).startIso)
        .lt("payment_date", getVNDayUtcRange(range.end).endIso)
    : query;
  const { data, error } = await rangedQuery
    .order("payment_date", { ascending: false })
    .limit(SEPAY_TRANSACTION_LIST_LIMIT);

  if (error) {
    console.error(
      "[finance:sepay-bank] failed to load supplier_payments",
      error.code,
    );
    return [];
  }

  return ((data ?? []) as SupplierPaymentRow[]).map((row) => {
    const invoice = firstRelation(row.supplier_invoices);
    const supplier = firstRelation(invoice?.suppliers);
    return {
      id: row.id,
      invoiceId: row.supplier_invoice_id,
      amount: Number(row.amount),
      paymentDate: row.payment_date,
      referenceNote: row.reference_note,
      invoiceNumber: invoice?.invoice_number ?? null,
      supplierName: supplier?.name ?? null,
    };
  });
}

async function fetchCompletedVietqrPayments(
  supabase: SupabaseClient,
  tenantId: number,
  range?: SepayDateRange,
): Promise<SepayPaymentWebhookCheck[]> {
  const query = supabase
    .from("payments")
    .select("id, order_id, amount, paid_at, provider_ref, provider_data")
    .eq("tenant_id", tenantId)
    .eq("method", "vietqr")
    .eq("status", "completed")
    .not("paid_at", "is", null);
  const rangedQuery = range
    ? query
        .gte("paid_at", getVNDayUtcRange(range.start).startIso)
        .lt("paid_at", getVNDayUtcRange(range.end).endIso)
    : query;
  const { data, error } = await rangedQuery
    .order("paid_at", { ascending: false })
    .limit(SEPAY_PAYMENT_WEBHOOK_CHECK_LIMIT);

  if (error) {
    console.error("[finance:sepay-bank] failed to load payments", error.code);
    return [];
  }

  const payments = ((data ?? []) as SepayPaymentRow[]).map((payment) => {
    const review = readSepayBankWebhookReview(payment.provider_data);
    return {
      paymentId: payment.id,
      orderId: payment.order_id,
      amount: payment.amount,
      paidAt: payment.paid_at,
      providerRef: payment.provider_ref,
      bankWebhookReviewStatus: review.status,
      bankWebhookReviewedAt: review.reviewedAt,
      bankWebhookReviewedBy: review.reviewedBy,
    };
  });
  if (!range) return payments;
  return payments.filter(
    (payment) =>
      payment.paidAt != null &&
      isSepayBusinessDateInRange(getVNDateString(payment.paidAt), range),
  );
}

async function fetchIncomingWebhookPaymentIds(
  supabase: SupabaseClient,
  tenantId: number,
  paymentIds: number[],
): Promise<Set<number>> {
  if (paymentIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("webhook_events")
    .select(SEPAY_WEBHOOK_SELECT)
    .eq("tenant_id", tenantId)
    .in("provider", ["sepay", "manual"])
    .in("payment_id", paymentIds)
    .eq("signature_valid", true);

  if (error) {
    console.error(
      "[finance:sepay-bank] failed to load payment webhook_events",
      error.code,
    );
    return new Set();
  }

  return new Set(
    ((data ?? []) as SepayWebhookRow[])
      .map(mapSepayWebhookRow)
      .filter((tx): tx is SepayBankTransaction => tx !== null)
      .filter(
        (tx) =>
          tx.transferType === "in" &&
          tx.paymentId != null &&
          tx.processingStatus !== "failed" &&
          tx.errorCode == null,
      )
      .flatMap((tx) => (tx.paymentId == null ? [] : [tx.paymentId])),
  );
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

export async function fetchSepayBankTransactions(
  range?: SepayDateRange,
): Promise<SepayBankTransaction[]> {
  const { supabase, claims } = await loadAuthState();
  const rows = await fetchSepayWebhookRows(
    supabase,
    claims.tenant_id,
    SEPAY_TRANSACTION_LIST_LIMIT,
    range,
  );
  const transactions = rows
    .map(mapSepayWebhookRow)
    .filter((tx): tx is SepayBankTransaction => tx !== null);
  const scopedTransactions = range
    ? transactions.filter((tx) => isSepayTransactionInDateRange(tx, range))
    : transactions;
  const matches = await fetchSepayExpenseMatches(
    supabase,
    claims.tenant_id,
    scopedTransactions.map((tx) => tx.eventId),
  );
  const supplierPaymentMatches = await fetchSupplierPaymentMatches(
    supabase,
    claims.tenant_id,
    range,
  );

  const transactionsWithExpenseMatches = scopedTransactions.map((tx) => {
    const expenseIds = matches.get(tx.eventId);
    if (!expenseIds?.length) return tx;
    return {
      ...tx,
      expenseId: expenseIds[0] ?? tx.expenseId,
      expenseIds,
    };
  });

  return attachSupplierPaymentMatches(
    transactionsWithExpenseMatches,
    supplierPaymentMatches,
  );
}

export async function fetchSepayPaymentWebhookSummary(
  range?: SepayDateRange,
): Promise<SepayPaymentWebhookSummary> {
  const { supabase, claims } = await loadAuthState();
  const payments = await fetchCompletedVietqrPayments(
    supabase,
    claims.tenant_id,
    range,
  );
  const matchedWebhookPaymentIds = await fetchIncomingWebhookPaymentIds(
    supabase,
    claims.tenant_id,
    payments.map((payment) => payment.paymentId),
  );
  return buildSepayPaymentWebhookSummary(payments, matchedWebhookPaymentIds);
}

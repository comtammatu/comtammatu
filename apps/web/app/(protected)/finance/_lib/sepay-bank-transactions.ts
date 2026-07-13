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
  type SepayExpenseAllocation,
  type SepayPaymentWebhookCheck,
  type SepayPaymentWebhookSummary,
  type SepaySupplierPaymentMatch,
  type SepayWebhookRow,
} from "./sepay-bank-transaction-model";

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

interface SepayExpenseMatchRow {
  webhook_event_id: number;
  expense_id: number;
  allocated_amount?: number | string | null;
}

interface SepayExpenseMatchResult {
  matches: Map<number, SepayExpenseAllocation[]>;
  allocationReady: boolean;
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
  "id, request_id, created_at, processing_status, error_code, order_id, payment_id, expense_id, payload" as const;

const SEPAY_BALANCE_PAGE_SIZE = 1000;
const SEPAY_TRANSACTION_LIST_LIMIT = 100;
const SEPAY_PAYMENT_WEBHOOK_CHECK_LIMIT = 100;

function isExpenseMatchSchemaMissing(code?: string | null): boolean {
  return code === "PGRST205" || code === "42P01";
}

function isExpenseAllocationColumnMissing(code?: string | null): boolean {
  return code === "PGRST204" || code === "42703";
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
    throw new Error("Unable to load signed bank transactions");
  }

  return (data ?? []) as unknown as SepayWebhookRow[];
}

async function fetchAllSepayWebhookRowsSince(
  supabase: SupabaseClient,
  tenantId: number,
  sinceDate: string,
): Promise<SepayWebhookRow[]> {
  const rows: SepayWebhookRow[] = [];
  const createdAfter = getVNDayUtcRange(sinceDate).startIso;
  let lastId = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("webhook_events")
      .select(SEPAY_WEBHOOK_SELECT)
      .eq("tenant_id", tenantId)
      .in("provider", ["sepay", "manual"])
      .eq("signature_valid", true)
      .gte("created_at", createdAfter)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(SEPAY_BALANCE_PAGE_SIZE);

    if (error) {
      console.error(
        "[finance:sepay-bank] failed to load complete bank movement",
        error.code,
      );
      throw new Error("Unable to load signed bank movement");
    }

    const page = (data ?? []) as unknown as SepayWebhookRow[];
    rows.push(...page);
    if (page.length < SEPAY_BALANCE_PAGE_SIZE) break;

    const nextId = page.at(-1)?.id;
    if (nextId == null || nextId <= lastId) {
      throw new Error("Unable to paginate signed bank movement");
    }
    lastId = nextId;
  }

  return rows;
}

async function fetchSepayExpenseMatches(
  supabase: SupabaseClient,
  tenantId: number,
  eventIds: number[],
): Promise<SepayExpenseMatchResult> {
  if (eventIds.length === 0) {
    return { matches: new Map(), allocationReady: true };
  }

  const allocationResult = await supabase
    .from("bank_transaction_expense_matches")
    .select("webhook_event_id, expense_id, allocated_amount")
    .eq("tenant_id", tenantId)
    .in("webhook_event_id", eventIds);
  let data: unknown = allocationResult.data;
  let error = allocationResult.error;
  let allocationReady = true;

  if (error && isExpenseAllocationColumnMissing(error.code)) {
    allocationReady = false;
    const legacyResult = await supabase
      .from("bank_transaction_expense_matches")
      .select("webhook_event_id, expense_id")
      .eq("tenant_id", tenantId)
      .in("webhook_event_id", eventIds);
    data = legacyResult.data as unknown;
    error = legacyResult.error;
  }

  if (error) {
    if (isExpenseMatchSchemaMissing(error.code)) {
      return { matches: new Map(), allocationReady: false };
    }
    console.error(
      "[finance:sepay-bank] failed to load bank_transaction_expense_matches",
      error.code,
    );
    throw new Error("Unable to load expense allocation evidence");
  }

  const matches = new Map<number, SepayExpenseAllocation[]>();
  for (const row of (data ?? []) as SepayExpenseMatchRow[]) {
    const allocations = matches.get(row.webhook_event_id) ?? [];
    const numericAmount = Number(row.allocated_amount);
    allocations.push({
      expenseId: row.expense_id,
      amount:
        row.allocated_amount != null && Number.isFinite(numericAmount)
          ? numericAmount
          : null,
    });
    matches.set(row.webhook_event_id, allocations);
  }
  return { matches, allocationReady };
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
    throw new Error("Unable to load supplier payment evidence");
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
    throw new Error("Unable to load completed VietQR payments");
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
    throw new Error("Unable to load payment webhook evidence");
  }

  return new Set(
    ((data ?? []) as unknown as SepayWebhookRow[])
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
  const rows = await fetchAllSepayWebhookRowsSince(
    supabase,
    tenantId,
    sinceDate,
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
  const { matches, allocationReady } = await fetchSepayExpenseMatches(
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
    const eventAllocations = matches.get(tx.eventId);
    const expenseAllocations = eventAllocations?.map((allocation) => ({
      ...allocation,
      amount:
        allocation.amount == null && eventAllocations.length === 1
          ? tx.amount
          : allocation.amount,
    }));
    if (!expenseAllocations?.length) return tx;
    const expenseIds = expenseAllocations.map(
      (allocation) => allocation.expenseId,
    );
    return {
      ...tx,
      expenseId: expenseIds[0] ?? tx.expenseId,
      expenseIds,
      expenseAllocations,
      expenseAllocationReady: allocationReady,
    };
  });

  const transactionsWithAllocationReadiness =
    transactionsWithExpenseMatches.map((transaction) => ({
      ...transaction,
      expenseAllocationReady: allocationReady,
    }));

  return attachSupplierPaymentMatches(
    transactionsWithAllocationReadiness,
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

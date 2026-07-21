import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import { loadAuthState } from "@/_lib/auth";
import {
  attachRefundMatches,
  attachSupplierPaymentMatches,
  buildSepayPaymentWebhookSummary,
  isSepayBusinessDateInRange,
  isSepayTransactionInDateRange,
  mapSepayWebhookRow,
  readSepayBankWebhookReview,
  type SepayBankIngestSource,
  type SepayBankTransaction,
  type SepayDateRange,
  type SepayPaymentWebhookCheck,
  type SepayPaymentWebhookSummary,
  type SepayRefundMatchOption,
  type SepaySupplierPaymentMatch,
  type SepayWebhookRow,
} from "./sepay-bank-transaction-model";

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

interface SepayDataApiRowsResult<T> {
  data: T[] | null;
  error: { code?: string } | null;
}

interface SepayExpenseMatchRow {
  webhook_event_id: number;
  expense_id: number;
}

interface BankReconciliationMatchRow {
  bank_transaction_id: number;
  payment_id: number | null;
  expense_id: number | null;
  supplier_payment_id: number | null;
  refund_id: number | null;
}

interface CanonicalPaymentMatchRow {
  payment_id: number | null;
}

interface SepayBankLedgerRow {
  id: number;
  provider_transaction_id: string;
  occurred_at: string;
  transfer_type: "in" | "out";
  amount: number | string;
  balance_after: number | string | null;
  account_number: string | null;
  code: string | null;
  content: string | null;
  reference_code: string | null;
  ingest_source: SepayBankIngestSource;
  webhook_event_id: number | null;
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
  webhook_event_id: number | null;
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

interface RefundMatchRow {
  id: number;
  amount: number;
  approved_at: string;
  order_id: number;
  webhook_event_id: number | null;
  orders?:
    | { order_number?: string | null }
    | Array<{ order_number?: string | null }>
    | null;
}

const SEPAY_WEBHOOK_SELECT =
  "id, request_id, created_at, processing_status, http_status, error_code, order_id, payment_id, expense_id, payload" as const;
const SEPAY_BANK_WEBHOOK_SELECT =
  `${SEPAY_WEBHOOK_SELECT}, orders!webhook_events_order_id_fkey(order_number)` as const;
const SEPAY_BANK_LEDGER_SELECT =
  "id, provider_transaction_id, occurred_at, transfer_type, amount, balance_after, account_number, code, content, reference_code, ingest_source, webhook_event_id" as const;

const SEPAY_DATA_API_PAGE_SIZE = 1000;
const SEPAY_DATA_API_IN_CHUNK_SIZE = 200;

export async function fetchSepayDataApiRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<SepayDataApiRowsResult<T>>,
  pageSize = SEPAY_DATA_API_PAGE_SIZE,
): Promise<SepayDataApiRowsResult<T>> {
  const size = Math.max(1, Math.floor(pageSize));
  const rows: T[] = [];

  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) return { data: null, error };

    const pageRows = data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < size) return { data: rows, error: null };
  }
}

function chunkSepayIds(
  values: readonly number[],
  chunkSize = SEPAY_DATA_API_IN_CHUNK_SIZE,
): number[][] {
  const ids = [...new Set(values)].filter(Number.isFinite);
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

async function fetchSepayChunkedDataApiRows<T>(
  ids: readonly number[],
  fetchPage: (
    ids: number[],
    from: number,
    to: number,
  ) => PromiseLike<SepayDataApiRowsResult<T>>,
): Promise<SepayDataApiRowsResult<T>> {
  const rows: T[] = [];
  for (const chunkIds of chunkSepayIds(ids)) {
    const result = await fetchSepayDataApiRows((from, to) =>
      fetchPage(chunkIds, from, to),
    );
    if (result.error) return result;
    rows.push(...(result.data ?? []));
  }
  return { data: rows, error: null };
}

function isExpenseMatchSchemaMissing(code?: string): boolean {
  return code === "PGRST205" || code === "42P01";
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

async function fetchSepayWebhookRows(
  supabase: SupabaseClient,
  tenantId: number,
  range?: SepayDateRange,
): Promise<SepayWebhookRow[]> {
  const { data, error } = await fetchSepayDataApiRows<SepayWebhookRow>(
    async (from, to) => {
      const query = supabase
        .from("webhook_events")
        .select(SEPAY_BANK_WEBHOOK_SELECT)
        .eq("tenant_id", tenantId)
        .in("provider", ["sepay", "manual"])
        .eq("signature_valid", true);
      const rangedQuery = range
        ? query
            .gte("created_at", getVNDayUtcRange(range.start).startIso)
            .lt("created_at", getVNDayUtcRange(range.end).endIso)
        : query;
      const result = await rangedQuery
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      return {
        data: (result.data ?? null) as unknown as SepayWebhookRow[] | null,
        error: result.error,
      };
    },
  );

  if (error) {
    console.error(
      "[finance:sepay-bank] failed to load webhook_events",
      error.code,
    );
    throw new Error("Unable to load SePay webhook events");
  }

  return (data ?? []) as unknown as SepayWebhookRow[];
}

function isBankLedgerSchemaMissing(code: string | undefined): boolean {
  return code === "PGRST205" || code === "42P01";
}

async function fetchSepayBankLedgerRows(
  supabase: SupabaseClient,
  tenantId: number,
  range?: SepayDateRange,
): Promise<SepayBankLedgerRow[] | null> {
  const { data, error } = await fetchSepayDataApiRows<SepayBankLedgerRow>(
    async (from, to) => {
      const query = supabase
        .from("bank_transactions")
        .select(SEPAY_BANK_LEDGER_SELECT)
        .eq("tenant_id", tenantId);
      const rangedQuery = range
        ? query
            .gte("occurred_at", getVNDayUtcRange(range.start).startIso)
            .lt("occurred_at", getVNDayUtcRange(range.end).endIso)
        : query;
      const result = await rangedQuery
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      return {
        data: (result.data ?? null) as unknown as SepayBankLedgerRow[] | null,
        error: result.error,
      };
    },
  );

  if (error) {
    if (isBankLedgerSchemaMissing(error.code)) return null;
    console.error(
      "[finance:sepay-bank] failed to load bank_transactions",
      error.code,
    );
    throw new Error("Unable to load SePay bank transactions");
  }

  return data ?? [];
}

async function fetchSepayWebhookRowsByIds(
  supabase: SupabaseClient,
  tenantId: number,
  eventIds: number[],
): Promise<Map<number, SepayWebhookRow>> {
  if (eventIds.length === 0) return new Map();

  const { data, error } = await fetchSepayChunkedDataApiRows<SepayWebhookRow>(
    eventIds,
    async (chunkIds, from, to) => {
      const result = await supabase
        .from("webhook_events")
        .select(SEPAY_BANK_WEBHOOK_SELECT)
        .eq("tenant_id", tenantId)
        .in("id", chunkIds)
        .order("id", { ascending: true })
        .range(from, to);
      return {
        data: (result.data ?? null) as unknown as SepayWebhookRow[] | null,
        error: result.error,
      };
    },
  );

  if (error) {
    console.error(
      "[finance:sepay-bank] failed to load bank transaction evidence",
      error.code,
    );
    throw new Error("Unable to load SePay bank transaction evidence");
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

function mapSepayBankLedgerRow(
  row: SepayBankLedgerRow,
  webhookRow: SepayWebhookRow | undefined,
): SepayBankTransaction {
  const webhookTransaction = webhookRow
    ? mapSepayWebhookRow(webhookRow)
    : null;
  const amount = Number(row.amount);
  const accumulated =
    row.balance_after == null ? null : Number(row.balance_after);

  return {
    bankTransactionId: row.id,
    eventId: row.webhook_event_id,
    ingestSource: row.ingest_source,
    requestId: row.provider_transaction_id,
    createdAt: row.occurred_at,
    processingStatus:
      webhookTransaction?.processingStatus ??
      (row.transfer_type === "out" ? "ignored" : "processed"),
    errorCode:
      webhookTransaction?.errorCode ??
      (row.transfer_type === "out" ? "transfer_type_out" : null),
    orderId: webhookTransaction?.orderId ?? null,
    orderNumber: webhookTransaction?.orderNumber ?? null,
    paymentId: webhookTransaction?.paymentId ?? null,
    expenseId: webhookTransaction?.expenseId ?? null,
    expenseIds: webhookTransaction?.expenseIds ?? [],
    supplierPaymentMatches: [],
    supplierPaymentMatchConfirmed: false,
    refundMatches: [],
    refundMatchConfirmed: false,
    transactionDate: row.occurred_at,
    accountNumber: row.account_number,
    code: row.code,
    content: row.content,
    transferType: row.transfer_type,
    amount: Number.isFinite(amount) ? amount : 0,
    accumulated:
      accumulated != null && Number.isFinite(accumulated) ? accumulated : null,
    referenceCode: row.reference_code,
  };
}

async function fetchSepayExpenseMatches(
  supabase: SupabaseClient,
  tenantId: number,
  eventIds: number[],
): Promise<Map<number, number[]>> {
  if (eventIds.length === 0) return new Map();

  const { data, error } = await fetchSepayChunkedDataApiRows(
    eventIds,
    async (chunkIds, from, to) => {
      const result = await supabase
        .from("bank_transaction_expense_matches")
        .select("webhook_event_id, expense_id")
        .eq("tenant_id", tenantId)
        .in("webhook_event_id", chunkIds)
        .order("webhook_event_id", { ascending: true })
        .order("expense_id", { ascending: true })
        .range(from, to);
      return { data: result.data, error: result.error };
    },
  );

  if (error) {
    if (isExpenseMatchSchemaMissing(error.code)) return new Map();
    console.error(
      "[finance:sepay-bank] failed to load bank_transaction_expense_matches",
      error.code,
    );
    throw new Error("Unable to load SePay expense matches");
  }

  const matches = new Map<number, number[]>();
  for (const row of (data ?? []) as SepayExpenseMatchRow[]) {
    const ids = matches.get(row.webhook_event_id) ?? [];
    ids.push(row.expense_id);
    matches.set(row.webhook_event_id, ids);
  }
  return matches;
}

async function fetchBankReconciliationMatches(
  supabase: SupabaseClient,
  tenantId: number,
  bankTransactionIds: number[],
): Promise<BankReconciliationMatchRow[]> {
  if (bankTransactionIds.length === 0) return [];

  const { data, error } =
    await fetchSepayChunkedDataApiRows<BankReconciliationMatchRow>(
      bankTransactionIds,
      async (chunkIds, from, to) => {
        const result = await supabase
          .from("bank_transaction_reconciliation_matches")
          .select(
            "bank_transaction_id, payment_id, expense_id, supplier_payment_id, refund_id",
          )
          .eq("tenant_id", tenantId)
          .in("bank_transaction_id", chunkIds)
          .order("bank_transaction_id", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
        return { data: result.data, error: result.error };
      },
    );

  if (error) {
    if (isBankLedgerSchemaMissing(error.code)) return [];
    console.error(
      "[finance:sepay-bank] failed to load bank reconciliation matches",
      error.code,
    );
    throw new Error("Unable to load bank reconciliation matches");
  }

  return data ?? [];
}

async function fetchSupplierPaymentMatches(
  supabase: SupabaseClient,
  tenantId: number,
  range?: SepayDateRange,
): Promise<SepaySupplierPaymentMatch[]> {
  const { data, error } = await fetchSepayDataApiRows<SupplierPaymentRow>(
    async (from, to) => {
      const query = supabase
        .from("supplier_payments")
        .select(
          "id, supplier_invoice_id, amount, payment_date, reference_note, webhook_event_id, supplier_invoices ( invoice_number, suppliers ( name ) )",
        )
        .eq("tenant_id", tenantId)
        .eq("payment_method", "bank_transfer");
      const rangedQuery = range
        ? query
            .gte("payment_date", getVNDayUtcRange(range.start).startIso)
            .lt("payment_date", getVNDayUtcRange(range.end).endIso)
        : query;
      const result = await rangedQuery
        .order("payment_date", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      return {
        data: (result.data ?? null) as unknown as SupplierPaymentRow[] | null,
        error: result.error,
      };
    },
  );

  if (error) {
    console.error(
      "[finance:sepay-bank] failed to load supplier_payments",
      error.code,
    );
    throw new Error("Unable to load SePay supplier payment matches");
  }

  return ((data ?? []) as unknown as SupplierPaymentRow[]).map((row) => {
    const invoice = firstRelation(row.supplier_invoices);
    const supplier = firstRelation(invoice?.suppliers);
    return {
      id: row.id,
      invoiceId: row.supplier_invoice_id,
      amount: Number(row.amount),
      paymentDate: row.payment_date,
      referenceNote: row.reference_note,
      webhookEventId: row.webhook_event_id,
      invoiceNumber: invoice?.invoice_number ?? null,
      supplierName: supplier?.name ?? null,
    };
  });
}

function mapRefundMatches(rows: RefundMatchRow[]): SepayRefundMatchOption[] {
  return rows.map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    approvedAt: row.approved_at,
    orderId: row.order_id,
    orderNumber: firstRelation(row.orders)?.order_number ?? `#${row.order_id}`,
    webhookEventId: row.webhook_event_id,
  }));
}

async function fetchConfirmedRefundMatches(
  supabase: SupabaseClient,
  tenantId: number,
  eventIds: number[],
): Promise<SepayRefundMatchOption[]> {
  if (eventIds.length === 0) return [];

  const { data, error } = await fetchSepayChunkedDataApiRows<RefundMatchRow>(
    eventIds,
    async (chunkIds, from, to) => {
      const result = await supabase
        .from("refunds")
        .select(
          "id, amount, approved_at, order_id, webhook_event_id, orders ( order_number )",
        )
        .eq("tenant_id", tenantId)
        .eq("status", "approved")
        .eq("payout_method", "bank_transfer")
        .in("webhook_event_id", chunkIds)
        .order("webhook_event_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return {
        data: (result.data ?? null) as unknown as RefundMatchRow[] | null,
        error: result.error,
      };
    },
  );

  if (error) {
    console.error(
      "[finance:sepay-bank] failed to load matched refunds",
      error.code,
    );
    throw new Error("Unable to load matched refunds");
  }

  return mapRefundMatches((data ?? []) as unknown as RefundMatchRow[]);
}

async function fetchRefundMatchesByIds(
  supabase: SupabaseClient,
  tenantId: number,
  refundIds: number[],
): Promise<SepayRefundMatchOption[]> {
  if (refundIds.length === 0) return [];

  const { data, error } = await fetchSepayChunkedDataApiRows<RefundMatchRow>(
    refundIds,
    async (chunkIds, from, to) => {
      const result = await supabase
        .from("refunds")
        .select(
          "id, amount, approved_at, order_id, webhook_event_id, orders ( order_number )",
        )
        .eq("tenant_id", tenantId)
        .eq("status", "approved")
        .eq("payout_method", "bank_transfer")
        .in("id", chunkIds)
        .order("id", { ascending: true })
        .range(from, to);
      return {
        data: (result.data ?? null) as unknown as RefundMatchRow[] | null,
        error: result.error,
      };
    },
  );

  if (error) {
    console.error(
      "[finance:sepay-bank] failed to load canonical refund matches",
      error.code,
    );
    throw new Error("Unable to load canonical refund matches");
  }

  return mapRefundMatches((data ?? []) as unknown as RefundMatchRow[]);
}

async function fetchCompletedVietqrPayments(
  supabase: SupabaseClient,
  tenantId: number,
  range?: SepayDateRange,
): Promise<SepayPaymentWebhookCheck[]> {
  const { data, error } = await fetchSepayDataApiRows<SepayPaymentRow>(
    async (from, to) => {
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
      const result = await rangedQuery
        .order("paid_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      return { data: result.data, error: result.error };
    },
  );

  if (error) {
    console.error("[finance:sepay-bank] failed to load payments", error.code);
    throw new Error("Unable to load VietQR payments");
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

  const { data, error } = await fetchSepayChunkedDataApiRows<SepayWebhookRow>(
    paymentIds,
    async (chunkIds, from, to) => {
      const result = await supabase
        .from("webhook_events")
        .select(SEPAY_WEBHOOK_SELECT)
        .eq("tenant_id", tenantId)
        .in("provider", ["sepay", "manual"])
        .in("payment_id", chunkIds)
        .eq("signature_valid", true)
        .order("payment_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return {
        data: (result.data ?? null) as unknown as SepayWebhookRow[] | null,
        error: result.error,
      };
    },
  );

  if (error) {
    console.error(
      "[finance:sepay-bank] failed to load payment webhook_events",
      error.code,
    );
    throw new Error("Unable to load SePay payment evidence");
  }

  const matchedPaymentIds = new Set(
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

  const canonicalResult =
    await fetchSepayChunkedDataApiRows<CanonicalPaymentMatchRow>(
      paymentIds,
      async (chunkIds, from, to) => {
        const result = await supabase
          .from("bank_transaction_reconciliation_matches")
          .select("payment_id")
          .eq("tenant_id", tenantId)
          .in("payment_id", chunkIds)
          .order("payment_id", { ascending: true })
          .range(from, to);
        return { data: result.data, error: result.error };
      },
    );

  if (canonicalResult.error) {
    if (isBankLedgerSchemaMissing(canonicalResult.error.code)) {
      return matchedPaymentIds;
    }
    console.error(
      "[finance:sepay-bank] failed to load canonical payment evidence",
      canonicalResult.error.code,
    );
    throw new Error("Unable to load canonical payment evidence");
  }

  for (const match of canonicalResult.data ?? []) {
    if (match.payment_id != null) matchedPaymentIds.add(match.payment_id);
  }
  return matchedPaymentIds;
}

export async function fetchSepayBankMovementSince(
  supabase: SupabaseClient,
  sinceIso: string,
) {
  const bankLedgerClient = supabase as unknown as {
    rpc: (
      fn: "get_bank_ledger_movement_since",
      args: { p_since: string },
    ) => PromiseLike<{
      data: { bank_in?: number; bank_out?: number } | null;
      error: { code?: string } | null;
    }>;
  };
  const { data, error } = await bankLedgerClient.rpc(
    "get_bank_ledger_movement_since",
    { p_since: sinceIso },
  );

  if (error) {
    console.error(
      "[finance:sepay-bank] failed to load bank movement",
      error.code,
    );
    throw new Error("Unable to load bank movement");
  }

  const inAmount = Number(data?.bank_in ?? 0);
  const outAmount = Number(data?.bank_out ?? 0);
  if (!Number.isFinite(inAmount) || !Number.isFinite(outAmount)) {
    throw new Error("Invalid bank movement response");
  }

  return { inAmount, outAmount };
}

export async function fetchSepayBankTransactions(
  range?: SepayDateRange,
): Promise<SepayBankTransaction[]> {
  const { supabase, claims } = await loadAuthState();
  const ledgerRows = await fetchSepayBankLedgerRows(
    supabase,
    claims.tenant_id,
    range,
  );
  let transactions: SepayBankTransaction[];

  if (ledgerRows == null) {
    const rows = await fetchSepayWebhookRows(
      supabase,
      claims.tenant_id,
      range,
    );
    transactions = rows
      .map(mapSepayWebhookRow)
      .filter((tx): tx is SepayBankTransaction => tx !== null);
  } else {
    const webhookRows = await fetchSepayWebhookRowsByIds(
      supabase,
      claims.tenant_id,
      ledgerRows
        .map((row) => row.webhook_event_id)
        .filter((id): id is number => id != null),
    );
    transactions = ledgerRows.map((row) =>
      mapSepayBankLedgerRow(
        row,
        row.webhook_event_id == null
          ? undefined
          : webhookRows.get(row.webhook_event_id),
      ),
    );
  }

  const scopedTransactions = range
    ? transactions.filter((tx) => isSepayTransactionInDateRange(tx, range))
    : transactions;
  const eventIds = scopedTransactions
    .map((tx) => tx.eventId)
    .filter((id): id is number => id != null);
  const bankTransactionIds = scopedTransactions
    .map((tx) => tx.bankTransactionId)
    .filter((id): id is number => id != null);
  const [matches, supplierPaymentRows, webhookRefundMatches, canonicalMatches] =
    await Promise.all([
    fetchSepayExpenseMatches(supabase, claims.tenant_id, eventIds),
    fetchSupplierPaymentMatches(supabase, claims.tenant_id, range),
    fetchConfirmedRefundMatches(supabase, claims.tenant_id, eventIds),
    fetchBankReconciliationMatches(
      supabase,
      claims.tenant_id,
      bankTransactionIds,
    ),
  ]);

  const canonicalMatchesByBankTransaction = new Map<
    number,
    BankReconciliationMatchRow[]
  >();
  const supplierBankTransactionById = new Map<number, number>();
  const refundBankTransactionById = new Map<number, number>();
  for (const match of canonicalMatches) {
    const current =
      canonicalMatchesByBankTransaction.get(match.bank_transaction_id) ?? [];
    current.push(match);
    canonicalMatchesByBankTransaction.set(match.bank_transaction_id, current);
    if (match.supplier_payment_id != null) {
      supplierBankTransactionById.set(
        match.supplier_payment_id,
        match.bank_transaction_id,
      );
    }
    if (match.refund_id != null) {
      refundBankTransactionById.set(match.refund_id, match.bank_transaction_id);
    }
  }

  const canonicalRefundRows = await fetchRefundMatchesByIds(
    supabase,
    claims.tenant_id,
    Array.from(refundBankTransactionById.keys()),
  );
  const refundMatches = Array.from(
    new Map(
      [...webhookRefundMatches, ...canonicalRefundRows].map((refund) => [
        refund.id,
        {
          ...refund,
          bankTransactionId:
            refundBankTransactionById.get(refund.id) ??
            refund.bankTransactionId ??
            null,
        },
      ]),
    ).values(),
  );
  const supplierPaymentMatches = supplierPaymentRows.map((payment) => ({
    ...payment,
    bankTransactionId:
      supplierBankTransactionById.get(payment.id) ??
      payment.bankTransactionId ??
      null,
  }));

  const transactionsWithExpenseMatches = scopedTransactions.map((tx) => {
    const canonicalRows =
      tx.bankTransactionId == null
        ? []
        : (canonicalMatchesByBankTransaction.get(tx.bankTransactionId) ?? []);
    const canonicalExpenseIds = canonicalRows.flatMap((match) =>
      match.expense_id == null ? [] : [match.expense_id],
    );
    const legacyExpenseIds =
      tx.eventId == null ? undefined : matches.get(tx.eventId);
    const expenseIds =
      canonicalExpenseIds.length > 0
        ? canonicalExpenseIds
        : (legacyExpenseIds ?? tx.expenseIds);
    const paymentId =
      canonicalRows.find((match) => match.payment_id != null)?.payment_id ??
      tx.paymentId;
    if (expenseIds.length === 0 && paymentId === tx.paymentId) return tx;
    return {
      ...tx,
      expenseId: expenseIds[0] ?? tx.expenseId,
      expenseIds,
      paymentId,
    };
  });

  return attachRefundMatches(
    attachSupplierPaymentMatches(
      transactionsWithExpenseMatches,
      supplierPaymentMatches,
    ),
    refundMatches,
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

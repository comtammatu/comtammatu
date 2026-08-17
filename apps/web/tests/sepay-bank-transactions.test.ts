import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  attachSupplierPaymentMatches,
  buildSepayPaymentWebhookSummary,
  buildSepayReconciliationSummary,
  canManuallyLinkSepayPayment,
  classifySepayReconciliationState,
  classifySepayUnmatchedMoneyIn,
  isOpenSepayBankWebhookReview,
  isSepayPaymentConflictReviewCode,
  isSepayTransactionInDateRange,
  mapSepayWebhookRow,
  readSepayBankWebhookReview,
  resolveSepayTransactionInstant,
  sepayTransactionBusinessDate,
  sumSepayBankMovementSince,
  type SepayBankTransaction,
  type SepayPaymentWebhookCheck,
  type SepaySupplierPaymentMatch,
  type SepayWebhookRow,
} from "../app/(protected)/finance/_lib/sepay-bank-transaction-model";
import { fetchSepayDataApiRows } from "../app/(protected)/finance/_lib/sepay-bank-transactions";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

test("bank reconciliation index alignment is replay-safe", () => {
  const baseline = read(
    "supabase/migration-archive/20260727120000_baseline.sql",
  );

  assert.match(
    baseline,
    /CREATE INDEX bank_transaction_reconciliation_matches_created_by_idx/,
  );
  assert.match(
    baseline,
    /CREATE INDEX bank_transaction_reconciliation_matches_tenant_idx/,
  );
});

function payment(
  paymentId: number,
  amount: number,
  reviewStatus: SepayPaymentWebhookCheck["bankWebhookReviewStatus"] = null,
): SepayPaymentWebhookCheck {
  return {
    paymentId,
    orderId: paymentId + 100,
    amount,
    paidAt: `2026-07-01T0${paymentId - 90}:00:00.000Z`,
    providerRef: `FT00${paymentId - 90}`,
    bankWebhookReviewStatus: reviewStatus,
    bankWebhookReviewedAt: reviewStatus ? "2026-07-01T09:00:00.000Z" : null,
    bankWebhookReviewedBy: reviewStatus ? "owner-user-id" : null,
  };
}

function row(
  id: number,
  payload: Record<string, unknown>,
  createdAt = "2026-07-01T01:00:00.000Z",
  expenseId: number | null = null,
  paymentId: number | null = null,
  processingStatus = "processed",
  errorCode: string | null = null,
  orderId: number | null = null,
  orderNumber: string | null = null,
  httpStatus: number | null = null,
): SepayWebhookRow {
  return {
    id,
    request_id: String(id),
    created_at: createdAt,
    processing_status: processingStatus,
    http_status: httpStatus,
    error_code: errorCode,
    order_id: orderId,
    payment_id: paymentId,
    expense_id: expenseId,
    orders: orderNumber ? { order_number: orderNumber } : null,
    payload,
  };
}

function tx(row: SepayWebhookRow): SepayBankTransaction {
  const mapped = mapSepayWebhookRow(row);
  assert.ok(mapped);
  return mapped;
}

function supplierPayment(
  id: number,
  amount: number,
  referenceNote: string | null,
  webhookEventId: number | null = null,
): SepaySupplierPaymentMatch {
  return {
    id,
    invoiceId: id + 1000,
    amount,
    paymentDate: "2026-07-01T02:05:00.000Z",
    referenceNote,
    webhookEventId,
    supplierName: "NCC Rau",
  };
}

test("SePay bank transaction maps incoming and outgoing webhook payloads", () => {
  const incoming = mapSepayWebhookRow(
    row(1, {
      transactionDate: "2026-07-01 08:30:00",
      accountNumber: "123456",
      content: "DHABC123",
      transferType: "in",
      transferAmount: "150000",
      accumulated: "1150000",
      referenceCode: "FT001",
    }),
  );
  const outgoing = mapSepayWebhookRow(
    row(2, {
      transactionDate: "2026-07-01 09:00:00",
      transferType: "out",
      transferAmount: -40000,
    }),
  );

  assert.equal(incoming?.transferType, "in");
  assert.equal(incoming?.amount, 150000);
  assert.equal(incoming?.accumulated, 1150000);
  assert.deepEqual(incoming?.expenseIds, []);
  assert.deepEqual(incoming?.supplierPaymentMatches, []);
  assert.equal(outgoing?.transferType, "out");
  assert.equal(outgoing?.amount, 40000);
  assert.deepEqual(
    mapSepayWebhookRow(
      row(
        3,
        {
          transactionDate: "2026-07-01 10:00:00",
          transferType: "out",
          transferAmount: 10000,
        },
        "2026-07-01T03:00:00.000Z",
        42,
      ),
    )?.expenseIds,
    [42],
  );
});

test("SePay conflict evidence maps the operational order number", () => {
  const conflict = tx(
    row(
      3,
      {
        transferType: "in",
        transferAmount: "150000",
        content: "MATU DH 321",
      },
      undefined,
      null,
      null,
      "processed",
      "payment_state_conflict_needs_review",
      321,
      "MT-20260715-0321",
    ),
  );

  assert.equal(conflict.orderId, 321);
  assert.equal(conflict.orderNumber, "MT-20260715-0321");
});

test("SePay Data API pagination reads every deterministic range", async () => {
  const rows = Array.from({ length: 2005 }, (_, index) => ({ id: index + 1 }));
  const requestedRanges: Array<[number, number]> = [];

  const result = await fetchSepayDataApiRows(async (from, to) => {
    requestedRanges.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });

  assert.equal(result.error, null);
  assert.equal(result.data?.length, 2005);
  assert.deepEqual(requestedRanges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test("SePay bank movement sums plus and minus from opening date", () => {
  const movement = sumSepayBankMovementSince(
    [
      row(1, {
        transactionDate: "2026-06-30 23:59:00",
        transferType: "in",
        transferAmount: 999999,
      }),
      row(2, {
        transactionDate: "2026-07-01 08:30:00",
        transferType: "in",
        transferAmount: 150000,
      }),
      row(3, {
        transactionDate: "2026-07-01 09:00:00",
        transferType: "out",
        transferAmount: 40000,
      }),
    ],
    "2026-07-01",
  );

  assert.deepEqual(movement, { inAmount: 150000, outAmount: 40000 });
});

test("SePay bank transaction date range uses transaction date then VN created date", () => {
  const range = { start: "2026-07-02", end: "2026-07-03" };

  assert.equal(
    isSepayTransactionInDateRange(
      tx(
        row(
          1,
          {
            transactionDate: "2026-07-02 00:30:00",
            transferType: "in",
            transferAmount: 150000,
          },
          "2026-07-01T17:30:00.000Z",
        ),
      ),
      range,
    ),
    true,
  );
  assert.equal(
    isSepayTransactionInDateRange(
      tx(
        row(2, {
          transactionDate: "2026-07-04 00:30:00",
          transferType: "out",
          transferAmount: 40000,
        }),
      ),
      range,
    ),
    false,
  );
  assert.equal(
    sepayTransactionBusinessDate(
      tx(
        row(
          3,
          { transferType: "in", transferAmount: 200000 },
          "2026-07-01T17:30:00.000Z",
        ),
      ),
    ),
    "2026-07-02",
  );
});

test("SePay provider-local timestamps resolve to an explicit Vietnam instant", () => {
  const createdAt = "2026-07-01T01:30:00.000Z";
  const localInstant = resolveSepayTransactionInstant({
    transactionDate: "2026-07-01 08:30:00",
    createdAt,
  });

  assert.equal(localInstant, "2026-07-01T08:30:00+07:00");
  assert.equal(formatVNDateTime(localInstant), "08:30 01/07/2026");
  assert.equal(
    resolveSepayTransactionInstant({
      transactionDate: "invalid",
      createdAt,
    }),
    createdAt,
  );
  assert.equal(
    resolveSepayTransactionInstant({
      transactionDate: "2026-07-01T08:30:00+07:00",
      createdAt,
    }),
    "2026-07-01T08:30:00+07:00",
  );
  const utcCrossover = {
    transactionDate: "2026-07-01T18:30:00Z",
    createdAt,
  };
  assert.equal(sepayTransactionBusinessDate(utcCrossover), "2026-07-02");
  assert.equal(
    formatVNDateTime(resolveSepayTransactionInstant(utcCrossover)),
    "01:30 02/07/2026",
  );
});

test("SePay reconciliation summary separates matched and review buckets", () => {
  const summary = buildSepayReconciliationSummary([
    tx(
      row(
        1,
        { transferType: "in", transferAmount: 150000 },
        "2026-07-01T01:00:00.000Z",
        null,
        91,
      ),
    ),
    tx(row(2, { transferType: "in", transferAmount: 200000 })),
    tx(
      row(
        3,
        { transferType: "out", transferAmount: 40000 },
        "2026-07-01T01:00:00.000Z",
        42,
      ),
    ),
    tx(row(4, { transferType: "out", transferAmount: 50000 })),
    {
      ...tx(
        row(6, {
          transactionDate: "2026-07-01 09:30:00",
          transferType: "out",
          transferAmount: 60000,
          referenceCode: "FT-SUP-1",
        }),
      ),
      supplierPaymentMatches: [supplierPayment(501, 60000, "FT-SUP-1", 6)],
      supplierPaymentMatchConfirmed: true,
    },
    tx(
      row(
        5,
        { transferType: "in", transferAmount: 10000 },
        "2026-07-01T01:00:00.000Z",
        null,
        null,
        "failed",
        "provider_error",
      ),
    ),
  ]);

  assert.equal(summary.matchedCount, 3);
  assert.equal(summary.needsReviewCount, 3);
  assert.equal(summary.needsReviewAmount, 260000);
  assert.equal(summary.unmatchedMoneyInCount, 1);
  assert.equal(summary.unmatchedMoneyInAmount, 200000);
  assert.equal(summary.unmatchedMoneyOutCount, 1);
  assert.equal(summary.unmatchedMoneyOutAmount, 50000);
  assert.equal(summary.failedCount, 1);
});

test("SePay reconciliation state follows actual source link", () => {
  assert.equal(
    classifySepayReconciliationState(
      tx(
        row(
          1,
          { transferType: "in", transferAmount: 150000 },
          undefined,
          null,
          91,
        ),
      ),
    ),
    "matched",
  );
  assert.equal(
    classifySepayReconciliationState(
      tx(row(2, { transferType: "out", transferAmount: 40000 }, undefined, 42)),
    ),
    "matched",
  );
  assert.equal(
    classifySepayReconciliationState({
      ...tx(row(5, { transferType: "out", transferAmount: 60000 })),
      supplierPaymentMatches: [supplierPayment(501, 60000, "FT-SUP-1", 5)],
      supplierPaymentMatchConfirmed: true,
    }),
    "matched",
  );
  assert.equal(
    classifySepayReconciliationState(
      tx(row(3, { transferType: "in", transferAmount: 200000 })),
    ),
    "needs_review",
  );
  assert.equal(
    classifySepayReconciliationState(
      tx(
        row(
          30,
          { transferType: "in", transferAmount: 200000 },
          undefined,
          null,
          null,
          "processed",
          null,
          930,
        ),
      ),
    ),
    "needs_review",
  );
  assert.equal(
    classifySepayReconciliationState(
      tx(
        row(
          4,
          { transferType: "in", transferAmount: 10000 },
          "2026-07-01T01:00:00.000Z",
          null,
          null,
          "failed",
          "provider_error",
        ),
      ),
    ),
    "webhook_error",
  );
});

test("SePay outgoing transactions can match supplier AP payments by reference", () => {
  const matched = attachSupplierPaymentMatches(
    [
      tx(
        row(1, {
          transactionDate: "2026-07-01 09:05:00",
          transferType: "out",
          transferAmount: 60000,
          referenceCode: "FT-SUP-1",
        }),
      ),
    ],
    [supplierPayment(501, 60000, "FT-SUP-1")],
  );

  assert.deepEqual(
    matched[0]?.supplierPaymentMatches.map((payment) => payment.id),
    [501],
  );
  assert.equal(matched[0]?.supplierPaymentMatchConfirmed, false);
  assert.equal(
    matched[0] && classifySepayReconciliationState(matched[0]),
    "needs_review",
  );

  const confirmed = attachSupplierPaymentMatches(
    [
      tx(
        row(1, {
          transactionDate: "2026-07-01 09:05:00",
          transferType: "out",
          transferAmount: 60000,
        }),
      ),
    ],
    [supplierPayment(501, 60000, null, 1)],
  );
  assert.equal(confirmed[0]?.supplierPaymentMatchConfirmed, true);
  assert.equal(
    confirmed[0] && classifySepayReconciliationState(confirmed[0]),
    "matched",
  );

  const ambiguous = attachSupplierPaymentMatches(
    [
      tx(
        row(2, {
          transactionDate: "2026-07-01 09:10:00",
          transferType: "out",
          transferAmount: 60000,
          referenceCode: "FT-SUP-2",
        }),
      ),
    ],
    [
      supplierPayment(502, 60000, "FT-SUP-2"),
      supplierPayment(503, 60000, "FT-SUP-2"),
    ],
  );

  assert.deepEqual(ambiguous[0]?.supplierPaymentMatches, []);
});

test("export-only bank rows do not treat null webhook IDs as confirmed matches", () => {
  const transaction: SepayBankTransaction = {
    ...tx(
      row(10, {
        transactionDate: "2026-07-01 09:05:00",
        transferType: "out",
        transferAmount: 60000,
      }),
    ),
    bankTransactionId: 99,
    eventId: null,
  };
  const unmatched = attachSupplierPaymentMatches(
    [transaction],
    [supplierPayment(501, 60000, null)],
  );

  assert.equal(unmatched[0]?.supplierPaymentMatchConfirmed, false);
  assert.deepEqual(unmatched[0]?.supplierPaymentMatches, []);

  const canonicalMatch = supplierPayment(501, 60000, null);
  canonicalMatch.bankTransactionId = 99;
  const confirmed = attachSupplierPaymentMatches(
    [transaction],
    [canonicalMatch],
  );
  assert.equal(confirmed[0]?.supplierPaymentMatchConfirmed, true);
  assert.deepEqual(
    confirmed[0]?.supplierPaymentMatches.map((payment) => payment.id),
    [501],
  );
});

test("SePay unmatched money-in classifier explains why no order is attached", () => {
  assert.equal(
    classifySepayUnmatchedMoneyIn(
      tx(row(1, { transferType: "in", transferAmount: 10000 })),
    ),
    "missing_reference",
  );
  assert.equal(
    classifySepayUnmatchedMoneyIn(
      tx(
        row(2, {
          transferType: "in",
          transferAmount: 20000,
          content: "TC-260709-001",
        }),
      ),
    ),
    "unmatched_reference",
  );
  assert.equal(
    classifySepayUnmatchedMoneyIn(
      tx(
        row(
          3,
          { transferType: "in", transferAmount: 30000 },
          "2026-07-01T01:00:00.000Z",
          null,
          null,
          "failed",
          "order_not_found",
        ),
      ),
    ),
    "webhook_error",
  );
});

test("signed SePay business mismatches stay reviewable without exposing conflict linking", () => {
  const recoverable = tx(
    row(
      4,
      { transferType: "in", transferAmount: 30000 },
      "2026-07-01T01:00:00.000Z",
      null,
      null,
      "processed",
      "missing_payment_code_needs_review",
    ),
  );
  const paymentConflict = tx(
    row(
      5,
      {
        transferType: "in",
        transferAmount: 30000,
        content: "DHABC123",
      },
      "2026-07-01T01:00:00.000Z",
      null,
      null,
      "processed",
      "payment_method_conflict_needs_review",
      105,
    ),
  );
  const technicalFailure = tx(
    row(
      6,
      { transferType: "in", transferAmount: 30000 },
      "2026-07-01T01:00:00.000Z",
      null,
      null,
      "failed",
      "invalid_amount",
    ),
  );

  assert.equal(classifySepayReconciliationState(recoverable), "needs_review");
  assert.equal(classifySepayUnmatchedMoneyIn(recoverable), "missing_reference");
  assert.equal(canManuallyLinkSepayPayment(recoverable), true);
  assert.equal(isSepayPaymentConflictReviewCode(recoverable.errorCode), false);

  assert.equal(
    classifySepayReconciliationState(paymentConflict),
    "needs_review",
  );
  assert.equal(canManuallyLinkSepayPayment(paymentConflict), false);
  assert.equal(
    isSepayPaymentConflictReviewCode(paymentConflict.errorCode),
    true,
  );
  assert.equal(
    isSepayPaymentConflictReviewCode("payment_state_conflict_needs_review"),
    true,
  );
  assert.equal(
    isSepayPaymentConflictReviewCode("overpayment_needs_review"),
    true,
  );

  assert.equal(
    classifySepayReconciliationState(technicalFailure),
    "webhook_error",
  );
  assert.equal(canManuallyLinkSepayPayment(technicalFailure), false);
  assert.equal(
    isSepayPaymentConflictReviewCode(technicalFailure.errorCode),
    false,
  );
});

test("signed SePay server failures can be replayed but client failures stay blocked", () => {
  const serverFailure = tx(
    row(
      7,
      { transferType: "in", transferAmount: 30000 },
      undefined,
      null,
      null,
      "failed",
      "payment_confirmation_failed",
      null,
      null,
      500,
    ),
  );
  const clientFailure = tx(
    row(
      8,
      { transferType: "in", transferAmount: 30000 },
      undefined,
      null,
      null,
      "failed",
      "invalid_amount",
      null,
      null,
      200,
    ),
  );

  assert.equal(canManuallyLinkSepayPayment(serverFailure), true);
  assert.equal(canManuallyLinkSepayPayment(clientFailure), false);
});

test("Owner replay of signed SePay evidence is exact, atomic, and audited", () => {
  const migration = read(
    "supabase/migration-archive/20260721174543_replay_signed_sepay_payment_evidence.sql",
  );
  const action = read(
    "apps/web/app/(protected)/finance/bank-webhook-review-actions.ts",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.replay_signed_sepay_payment_evidence/,
  );
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(migration, /v_event\.signature_valid/);
  assert.match(migration, /v_event\.http_status, 0\) >= 500/);
  assert.match(migration, /payment\.status = 'pending'/);
  assert.match(migration, /v_amount <> v_payment\.amount/);
  assert.match(
    migration,
    /reconcile_sepay_order_evidence\(v_event\.id, v_payment_code\)/,
  );
  assert.match(migration, /INSERT INTO public\.audit_logs/);
  assert.match(migration, /TO service_role/);
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE[\s\S]*replay_signed_sepay_payment_evidence[\s\S]*TO authenticated/,
  );
  assert.match(action, /\.in\("status", \["pending", "completed"\]\)/);
  assert.match(action, /createServiceClient\(\)/);
  assert.match(action, /replay_signed_sepay_payment_evidence/);
  assert.match(action, /p_actor_id: user\.id/);
});

test("SePay money-in manual link stays guarded by RPC", () => {
  const migration = read(
    "supabase/migration-archive/20260709064834_link_sepay_transaction_to_payment.sql",
  );
  const action = read(
    "apps/web/app/(protected)/finance/bank-webhook-review-actions.ts",
  );
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );
  const canonicalMigration = read(
    "supabase/migration-archive/20260719220000_create_bank_reconciliation_matches.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.link_sepay_transaction_to_payment/,
  );
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /provider = 'sepay'/);
  assert.match(migration, /payload->>'transferType'[\s\S]*<> 'in'/);
  assert.match(migration, /v_payment\.amount <> v_amount/);
  assert.match(migration, /payment_already_has_bank_webhook/);
  assert.match(migration, /PERFORM public\.log_audit/);
  assert.match(action, /linkSepayTransactionToPayment/);
  assert.match(action, /link_sepay_transaction_to_payment/);
  assert.match(action, /reconcile_bank_transaction_targets/);
  assert.match(action, /searchSepayMatchablePayments/);
  assert.match(action, /ilike\("order_number"/);
  assert.match(table, /MatchPaymentSheet/);
  assert.match(
    read(
      "apps/web/app/(protected)/finance/bank-transactions/match-payment-sheet.tsx",
    ),
    /linkSepayTransactionToPayment/,
  );
  assert.match(
    canonicalMigration,
    /CREATE TABLE public\.bank_transaction_reconciliation_matches/,
  );
  assert.match(
    canonicalMigration,
    /COMMENT ON TABLE public\.bank_transaction_reconciliation_matches IS[\s\S]*never change bank balance/,
  );
  assert.match(
    canonicalMigration,
    /CREATE OR REPLACE FUNCTION public\.reconcile_bank_transaction_targets/,
  );
  assert.doesNotMatch(
    canonicalMigration.match(
      /CREATE OR REPLACE FUNCTION public\.reconcile_bank_transaction_targets[\s\S]*?COMMENT ON FUNCTION public\.reconcile_bank_transaction_targets/,
    )?.[0] ?? "",
    /UPDATE public\.bank_transactions|SET amount =|SET transfer_type =/,
  );
});

test("SePay conflict hardening gates automatic settlement and Owner recovery", () => {
  const migration = read(
    "supabase/migration-archive/20260715135031_harden_sepay_payment_conflicts.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.reconcile_sepay_order_evidence/,
  );
  assert.match(migration, /PERFORM pg_advisory_xact_lock\(v_order_id\)/);
  assert.match(migration, /payment_method_conflict_needs_review/);
  assert.match(migration, /payment_state_conflict_needs_review/);
  assert.match(migration, /overpayment_needs_review/);
  assert.match(migration, /prior_event\.payment_id IS NOT NULL/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.confirm_sepay_payment\([\s\S]*service_role/,
  );
  assert.match(migration, /NOT public\.auth_is_owner\(v_user_id\)/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.link_sepay_transaction_to_payment\(bigint, bigint\)[\s\S]*TO authenticated/,
  );
  assert.match(
    migration,
    /WHEN 'missing_payment_code' THEN 'missing_payment_code_needs_review'/,
  );
  assert.doesNotMatch(migration, /corrected_from_cash/);
});

test("SePay reconciliation LIST loader bounds first paint without exhaust scan", () => {
  const loader = read(
    "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
  );
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );
  const page = read(
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
  );
  const messages = read("apps/web/lib/messages/finance.ts");

  assert.match(loader, /SEPAY_LIST_PAGE_SIZE\s*=\s*100/);
  assert.match(loader, /fetchSepayBankLedgerRowsPage/);
  assert.match(loader, /fetchSupplierPaymentMatchesForPage/);
  assert.match(
    loader,
    /fetchSepayBankTransactions[\s\S]*?maxRows\s*\?\?\s*SEPAY_LIST_PAGE_SIZE/,
  );
  assert.match(page, /maxRows:\s*SEPAY_LIST_PAGE_SIZE/);
  assert.match(loader, /SEPAY_DATA_API_PAGE_SIZE = 1000/);
  assert.match(loader, /SEPAY_DATA_API_IN_CHUNK_SIZE = 200/);
  assert.match(loader, /fetchSepayChunkedDataApiRows/);
  assert.match(
    loader,
    /fetchSepayBankLedgerRowsPage[\s\S]*?\.range\(0, limit - 1\)/,
  );
  assert.match(
    loader,
    /\.order\("paid_at", \{ ascending: false \}\)[\s\S]*\.order\("id", \{ ascending: false \}\)[\s\S]*\.range\(from, to\)/,
  );
  assert.doesNotMatch(
    loader,
    /SEPAY_(?:TRANSACTION_LIST|PAYMENT_WEBHOOK_CHECK)_LIMIT/,
  );
  assert.doesNotMatch(table, /return tx\.errorCode/);
  assert.doesNotMatch(table, /return tx\.processingStatus/);
  assert.match(messages, /payment_method_conflict_needs_review/);
  assert.match(messages, /overpayment_needs_review/);
});

test("SePay bank reconciliation reads supplier AP payments without turning them into expenses", () => {
  const loader = read(
    "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
  );
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );
  const cell = read(
    "apps/web/app/(protected)/finance/bank-transactions/match-expense-cell.tsx",
  );
  const action = read("apps/web/app/(protected)/finance/expense-actions.ts");
  const migration = read(
    "supabase/migration-archive/20260714031025_20260713153523_persist_sepay_supplier_payment_match.sql",
  );

  assert.match(loader, /\.from\("supplier_payments"\)/);
  assert.match(loader, /supplier_invoice_id/);
  assert.match(loader, /webhook_event_id/);
  assert.match(loader, /attachSupplierPaymentMatches/);
  assert.match(table, /supplierPaymentMatches=\{tx\.supplierPaymentMatches\}/);
  assert.match(table, /supplierPaymentMatchConfirmed=/);
  assert.match(cell, /copy\.clearSupplierPaymentMatch/);
  assert.match(cell, /matchSepayTransactionWithSupplierPayments/);
  assert.doesNotMatch(cell, /sm:h-7|sm:min-h-7/);
  assert.match(action, /match_sepay_transaction_supplier_payments/);
  assert.match(migration, /ADD COLUMN webhook_event_id bigint/);
  assert.match(migration, /public\.auth_is_owner\(v_user_id\)/);
  assert.match(migration, /supplier_payment_amount_mismatch/);
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON public\.supplier_payments/,
  );
  assert.match(migration, /guard_expense_match_without_supplier_payment/);
});

test("SePay bank page uses one filtered reconciliation table", () => {
  const page = read(
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
  );
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );
  const messages = read("apps/web/lib/messages/finance.ts");

  assert.match(page, /<BankTransactionsTable/);
  assert.match(page, /<AppPage width="xwide"/);
  assert.doesNotMatch(page, /meta=\{messages\.finance\.basic\.periodMeta/);
  assert.doesNotMatch(
    page,
    /KpiCard|KpiRow|needsReviewAmount|buildSepayReconciliationSummary/,
  );
  assert.match(table, /type BankReconciliationRow/);
  assert.match(table, /rowMatchesFilter/);
  assert.match(table, /parseBankReconciliationFilter/);
  assert.match(table, /<FilterBar/);
  assert.match(table, /trailing=\{/);
  assert.match(table, /aria-label=\{copy\.filters\.label\}/);
  assert.match(table, /TooltipTrigger/);
  assert.match(table, /<AppSheet/);
  assert.match(table, /trigger=\{/);
  assert.match(table, /key: "date"/);
  assert.match(table, /key: "content"/);
  assert.match(table, /key: "status"/);
  assert.doesNotMatch(table, /key: "action"/);
  assert.match(table, /copy\.table\.date/);
  assert.match(table, /formatVNDate/);
  assert.match(table, /formatVNTimeSeconds/);
  assert.match(table, /BankRowStatus/);
  assert.doesNotMatch(table, /key: "index"/);
  assert.doesNotMatch(table, /header: "#"/);
  assert.doesNotMatch(table, /sticky left-/);
  assert.doesNotMatch(table, /bg-background/);
  assert.match(table, /<AppListFrame[\s\S]*?title=\{copy\.listTitle\}/);
  assert.match(table, /contentScroll/);
  assert.match(table, /variant="inline"/);
  assert.doesNotMatch(table, /<AppSection/);
  assert.doesNotMatch(table, /rounded-lg border bg-card/);
  assert.match(table, /copy\.matchedPayment\(tx\.paymentId\)/);
  assert.match(
    table,
    /import \{ displayBankContent \} from "\.\.\/_lib\/display-bank-content"/,
  );
  assert.match(table, /export \{ displayBankContent \}/);
  assert.match(
    read(
      "apps/web/app/(protected)/finance/_lib/display-bank-content.ts",
    ),
    /export function displayBankContent/,
  );
  assert.doesNotMatch(table, /function reasonDetail/);
  assert.doesNotMatch(table, /key: "match"/);
  assert.match(table, /queueCount\(formatCount\(openQueueCount\)\)/);
  assert.match(table, /const hasRows = rows\.length > 0/);
  assert.match(table, /const isQueueView = filter === "needs_review"/);
  assert.match(table, /copy\.queueEmptyTitle/);
  assert.match(table, /emptyMode=\{hasRows \? "no-results" : "no-data"\}/);
  assert.match(table, /mobileBreakpoint=\{1024\}/);
  assert.match(table, /useFormControlSize\(\)/);
  assert.match(table, /const isTouchLayout = controlSize === "touch"/);
  assert.match(table, /financeFilterReconTriggerClassName/);
  assert.match(table, /<ItemHeader>/);
  assert.match(table, /<ItemTitle/);
  assert.match(table, /<ItemFooter/);
  assert.doesNotMatch(table, /useIsMobile\(1024\)/);
  assert.doesNotMatch(
    table,
    /text-xs font-medium text-muted-foreground[\s\S]*copy\.filters\.label/,
  );
  const matchPayment = read(
    "apps/web/app/(protected)/finance/bank-transactions/match-payment-sheet.tsx",
  );
  assert.match(matchPayment, /InputGroup size=\{touch \? "touch" : "default"\}/);
  assert.match(table, /size=\{touch \? "touch" : "sm"\}/);
  assert.ok(
    ((table.match(/size=\{touch \? "touch" : "default"\}/g)?.length ?? 0) +
      (matchPayment.match(/size=\{touch \? "touch" : "default"\}/g)?.length ??
        0)) >=
      4,
  );
  assert.doesNotMatch(table, /className="h-8 w-(?:24|40)/);
  assert.match(table, /formatVNDateTime/);
  assert.match(table, /resolveSepayTransactionInstant/);
  assert.match(table, /isSepayPaymentConflictReviewCode\(tx\.errorCode\)/);
  assert.match(
    table,
    /reasonLabel\(classifySepayUnmatchedMoneyIn\(tx\)\)/,
  );
  assert.match(table, /const conflictOrder[\s\S]*tx\.orderNumber/);
  assert.match(
    table,
    /href=\{`\/orders\?orderId=\$\{String\(conflictOrder\.id\)\}`\}/,
  );
  assert.match(table, /conflictOrder\.number/);
  assert.doesNotMatch(
    table,
    /conflictOrder[\s\S]{0,300}formatOrderId\(conflictOrder/,
  );
  assert.doesNotMatch(
    table,
    /copy\.unmatchedMoneyInTable\.conflictOrder:/,
  );
  assert.match(messages, /conflictOrder: "Đơn liên quan"/);
  assert.match(messages, /openConflictOrder: "Mở đơn"/);
  assert.match(messages, /date: "Ngày"/);

  const loader = read(
    "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
  );
  const ordersActions = read("apps/web/app/(protected)/orders/actions.ts");
  const ordersPage = read("apps/web/app/(protected)/orders/page.tsx");
  const ordersBody = read(
    "apps/web/app/(protected)/orders/orders-page-body.tsx",
  );
  const ordersClient = read(
    "apps/web/app/(protected)/orders/orders-client.tsx",
  );
  assert.match(loader, /orders!webhook_events_order_id_fkey\(order_number\)/);
  assert.match(
    ordersActions,
    /orderId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/,
  );
  assert.match(
    ordersActions,
    /query = query\.eq\("id", parsed\.data\.orderId\)/,
  );
  assert.match(ordersPage, /fetchOrders\(\{[\s\S]*orderId: requestedOrderId/);
  assert.match(ordersPage, /initialSelectedOrder == null\) notFound\(\)/);
  assert.match(ordersBody, /initialSelectedOrder=\{initialSelectedOrder\}/);
  assert.match(
    ordersClient,
    /useState<OrderRow \| null>\([\s\S]*initialSelectedOrder/,
  );
  assert.doesNotMatch(table, /\.replace\("T", " "\)\.slice/);
  assert.match(table, /return state === "needs_review"/);
  assert.match(table, /evidence=\{\{/);
  assert.match(table, /money_out_review/);
  assert.match(table, /missing_webhook/);
  assert.doesNotMatch(page, /outgoingMoneyReviewTransactions/);
  assert.match(messages, /Lọc giao dịch/);
  assert.match(messages, /label: "Lọc"/);
  assert.match(messages, /title: "Giao dịch"/);
  assert.match(messages, /bankTransactions: "Giao dịch"/);
  assert.match(messages, /Thanh toán #\$\{id\}/);
  assert.match(messages, /linkTitle: "Khớp đơn"/);

  const matchCell = read(
    "apps/web/app/(protected)/finance/bank-transactions/match-expense-cell.tsx",
  );
  const matchEvidence = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-match-evidence.tsx",
  );
  assert.match(matchCell, /<AppSheet/);
  assert.match(matchCell, /description=\{copy.matchSheetDescription\}/);
  assert.doesNotMatch(matchCell, /Popover(Content|Trigger)?/);
  assert.doesNotMatch(matchCell, /max-h-(48|72).*overflow-y-auto/);
  assert.match(matchCell, /htmlFor=\{checkboxId\}/);
  assert.match(matchCell, /formatVNBusinessDate/);
  assert.match(matchEvidence, /displayBankContent/);
  assert.match(matchCell, /FinanceMoneySummary/);
  assert.match(matchCell, /ToggleGroup/);
  assert.match(matchPayment, /searchSepayMatchablePayments/);
  assert.match(matchPayment, /table\.linkInputLabel/);
  assert.match(messages, /Hoàn tiền \$\{order\}/);
  assert.match(messages, /Thiếu bằng chứng NH/);
  assert.match(messages, /Nộp tiền mặt vào tài khoản/);
  assert.match(messages, /Không còn việc cần xử lý/);
});

test("SePay content keeps reconciliation metadata outside transfer tooltips", () => {
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );

  assert.match(table, /formatVNDateTime\(instant\)/);
  assert.match(table, /const reference = referenceCode\(row\.tx\)/);
  assert.match(table, /const isLongContent = content\.length > 80/);
  assert.doesNotMatch(table, /showMetadata/);
  assert.doesNotMatch(table, /text-background\/75/);
  assert.match(
    table,
    /<TooltipContent side="top" className="max-w-sm whitespace-normal">\s*<p className="break-words font-medium">\{content\}<\/p>/,
  );
  assert.doesNotMatch(table, /\[tr:nth-child\(even\)_&\]/);
  assert.doesNotMatch(table, /\[tr:nth-child\(even\)_&\]:bg-secondary\/15/);
});

test("SePay default review queue keeps only open webhook evidence", () => {
  assert.equal(isOpenSepayBankWebhookReview(null), true);
  assert.equal(isOpenSepayBankWebhookReview("reviewing"), true);
  assert.equal(isOpenSepayBankWebhookReview("resolved"), false);
  assert.equal(isOpenSepayBankWebhookReview("ignored"), false);
});

test("SePay payment webhook summary finds paid VietQR payments without bank evidence", () => {
  const payments: SepayPaymentWebhookCheck[] = [
    payment(91, 150000),
    payment(92, 200000),
    payment(93, 50000),
  ];

  const summary = buildSepayPaymentWebhookSummary(payments, new Set([91, 93]));

  assert.equal(summary.checkedPaymentCount, 3);
  assert.equal(summary.matchedPaymentCount, 2);
  assert.equal(summary.missingBankWebhookCount, 1);
  assert.equal(summary.missingBankWebhookAmount, 200000);
  assert.equal(summary.openMissingBankWebhookCount, 1);
  assert.equal(summary.openMissingBankWebhookAmount, 200000);
  assert.deepEqual(summary.missingBankWebhookPayments, [payments[1]]);
});

test("SePay payment webhook summary keeps handled missing payments out of the open queue", () => {
  const payments: SepayPaymentWebhookCheck[] = [
    payment(91, 150000),
    payment(92, 200000, "resolved"),
    payment(93, 50000, "ignored"),
    payment(94, 80000, "reviewing"),
  ];

  const summary = buildSepayPaymentWebhookSummary(payments, new Set([91]));

  assert.equal(summary.missingBankWebhookCount, 3);
  assert.equal(summary.missingBankWebhookAmount, 330000);
  assert.equal(summary.openMissingBankWebhookCount, 1);
  assert.equal(summary.openMissingBankWebhookAmount, 80000);
  assert.deepEqual(summary.missingBankWebhookPayments, [
    payments[1],
    payments[2],
    payments[3],
  ]);
});

test("SePay bank webhook review parser ignores malformed provider data", () => {
  assert.deepEqual(
    readSepayBankWebhookReview({
      bankWebhookReview: {
        status: "resolved",
        reviewedAt: "2026-07-01T09:00:00.000Z",
        reviewedBy: "owner-user-id",
      },
    }),
    {
      status: "resolved",
      reviewedAt: "2026-07-01T09:00:00.000Z",
      reviewedBy: "owner-user-id",
    },
  );

  assert.deepEqual(
    readSepayBankWebhookReview({
      bankWebhookReview: {
        status: "closed",
        reviewedAt: 1,
        reviewedBy: null,
      },
    }),
    { status: null, reviewedAt: null, reviewedBy: null },
  );
});

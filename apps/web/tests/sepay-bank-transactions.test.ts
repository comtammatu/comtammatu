import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  attachSupplierPaymentMatches,
  buildSepayPaymentWebhookSummary,
  buildSepayReconciliationSummary,
  classifySepayReconciliationState,
  classifySepayUnmatchedMoneyIn,
  isSepayTransactionInDateRange,
  mapSepayWebhookRow,
  readSepayBankWebhookReview,
  sepayTransactionBusinessDate,
  sumSepayBankMovementSince,
  type SepayBankTransaction,
  type SepayPaymentWebhookCheck,
  type SepaySupplierPaymentMatch,
  type SepayWebhookRow,
} from "../app/(protected)/finance/_lib/sepay-bank-transaction-model";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

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
): SepayWebhookRow {
  return {
    id,
    request_id: String(id),
    created_at: createdAt,
    processing_status: processingStatus,
    error_code: errorCode,
    order_id: orderId,
    payment_id: paymentId,
    expense_id: expenseId,
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
    invoiceNumber: `INV-${id}`,
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

test("SePay money-in manual link stays guarded by RPC", () => {
  const migration = read(
    "supabase/migrations/20260709064834_link_sepay_transaction_to_payment.sql",
  );
  const action = read(
    "apps/web/app/(protected)/finance/bank-webhook-review-actions.ts",
  );
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
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
  assert.match(table, /LinkPaymentCell/);
  assert.match(table, /linkSepayTransactionToPayment/);
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
    "supabase/migrations/20260714031025_20260713153523_persist_sepay_supplier_payment_match.sql",
  );

  assert.match(loader, /\.from\("supplier_payments"\)/);
  assert.match(loader, /supplier_invoice_id/);
  assert.match(loader, /webhook_event_id/);
  assert.match(loader, /attachSupplierPaymentMatches/);
  assert.match(table, /supplierPaymentMatches=\{tx\.supplierPaymentMatches\}/);
  assert.match(table, /supplierPaymentMatchConfirmed=/);
  assert.match(cell, /supplierInvoiceHref/);
  assert.match(cell, /\/finance\/supplier-invoices\?invoiceId=/);
  assert.match(cell, /matchedSupplierPayment/);
  assert.match(cell, /matchSepayTransactionWithSupplierPayments/);
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
  assert.match(table, /type BankReconciliationRow/);
  assert.match(table, /rowMatchesFilter/);
  assert.match(table, /money_out_review/);
  assert.match(table, /missing_webhook/);
  assert.doesNotMatch(page, /outgoingMoneyReviewTransactions/);
  assert.match(messages, /Lọc đối soát/);
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

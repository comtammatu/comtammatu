import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  attachPersistedSupplierPaymentMatches,
  buildSepayPaymentWebhookSummary,
  buildSepayReconciliationSummary,
  classifySepayPaymentConflict,
  classifySepayReconciliationState,
  classifySepayUnmatchedMoneyIn,
  isSepayOverpayment,
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
): SepaySupplierPaymentMatch {
  return {
    id,
    invoiceId: id + 1000,
    amount,
    paymentDate: "2026-07-01T02:05:00.000Z",
    referenceNote,
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
      supplierPaymentMatches: [supplierPayment(501, 60000, "FT-SUP-1")],
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
      supplierPaymentMatches: [supplierPayment(501, 60000, "FT-SUP-1")],
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

test("SePay second distinct transfer stays in review without becoming webhook error", () => {
  const overpayment = tx(
    row(
      31,
      { transferType: "in", transferAmount: 50000 },
      "2026-07-01T01:00:00.000Z",
      null,
      null,
      "processed",
      "overpayment_needs_review",
      931,
    ),
  );

  assert.equal(isSepayOverpayment(overpayment), true);
  assert.equal(classifySepayReconciliationState(overpayment), "needs_review");
  assert.equal(classifySepayUnmatchedMoneyIn(overpayment), "overpayment");

  const summary = buildSepayReconciliationSummary([overpayment]);
  assert.equal(summary.needsReviewCount, 1);
  assert.equal(summary.needsReviewAmount, 50000);
  assert.equal(summary.failedCount, 0);
  assert.equal(summary.unmatchedMoneyInCount, 1);
  assert.equal(summary.unmatchedMoneyInAmount, 50000);
});

test("SePay payment conflicts stay in review and cannot look like webhook failures", () => {
  const methodConflict = tx(
    row(
      32,
      { transferType: "in", transferAmount: 70000 },
      undefined,
      null,
      null,
      "processed",
      "payment_method_conflict_needs_review",
      932,
    ),
  );
  const stateConflict = tx(
    row(
      33,
      { transferType: "in", transferAmount: 80000 },
      undefined,
      null,
      null,
      "processed",
      "payment_state_conflict_needs_review",
      933,
    ),
  );

  assert.equal(
    classifySepayPaymentConflict(methodConflict),
    "payment_method_conflict",
  );
  assert.equal(
    classifySepayPaymentConflict(stateConflict),
    "payment_state_conflict",
  );
  assert.equal(
    classifySepayReconciliationState(methodConflict),
    "needs_review",
  );
  assert.equal(classifySepayReconciliationState(stateConflict), "needs_review");
  assert.equal(
    classifySepayUnmatchedMoneyIn(methodConflict),
    "payment_method_conflict",
  );
  assert.equal(
    classifySepayUnmatchedMoneyIn(stateConflict),
    "payment_state_conflict",
  );

  const summary = buildSepayReconciliationSummary([
    methodConflict,
    stateConflict,
  ]);
  assert.equal(summary.needsReviewCount, 2);
  assert.equal(summary.failedCount, 0);
  assert.equal(summary.unmatchedMoneyInCount, 2);
});

test("SePay duplicate-transfer guard quarantines the second event before payment completion", () => {
  const migration = read(
    "supabase/migrations/20260712161526_quarantine_duplicate_sepay_transfers.sql",
  );
  const route = read("apps/web/app/api/webhooks/sepay/route.ts");
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );

  assert.match(
    migration,
    /prior_event\.request_id IS DISTINCT FROM v_event\.request_id/,
  );
  assert.match(migration, /prior_event\.payment_id = v_payment\.id/);
  assert.match(migration, /error_code = 'overpayment_needs_review'/);
  assert.match(migration, /payment_id = NULL/);
  assert.match(migration, /'status', 'overpayment_needs_review'/);
  assert.match(
    migration,
    /position\([\s\S]*payment_code[\s\S]*IN v_event_memo/,
  );
  assert.match(migration, /btrim\(payment_code\) <> ''/);
  assert.match(migration, /\[A-Za-z0-9\]\{15,49\}/);
  assert.doesNotMatch(migration, /IF v_order_count = 0 THEN\s+FOR v_order IN/);
  const memoOrderScan = migration.indexOf("FOR v_order IN");
  const noMatchResult = migration.indexOf(
    "IF v_order_count = 0",
    memoOrderScan,
  );
  const ambiguousResult = migration.indexOf(
    "IF v_order_count > 1",
    noMatchResult,
  );
  assert.ok(
    memoOrderScan >= 0 &&
      noMatchResult > memoOrderScan &&
      ambiguousResult > noMatchResult,
    "all memo payment codes must be counted before selecting an order",
  );
  const advisoryLock = migration.indexOf("pg_advisory_xact_lock(v_order_id)");
  const lockedOrder = migration.indexOf("INTO v_order", advisoryLock);
  const selectedCodeCheck = migration.indexOf(
    "v_requested_payment_code <> ''",
    lockedOrder,
  );
  assert.ok(
    advisoryLock > ambiguousResult &&
      lockedOrder > advisoryLock &&
      selectedCodeCheck > lockedOrder,
    "the optional route-selected code must be checked only after one memo match remains",
  );
  const stateMatrixStart = migration.indexOf("IF v_payment_count > 1");
  const stateMatrix = migration.slice(
    stateMatrixStart,
    migration.indexOf("IF v_payment_found", stateMatrixStart + 1),
  );
  assert.match(
    stateMatrix,
    /v_payment\.status = 'pending'[\s\S]*v_payment\.method = 'vietqr'[\s\S]*v_order\.payment_status IN \('unpaid', 'pending'\)[\s\S]*v_order\.payment_method = 'vietqr'/,
  );
  assert.match(stateMatrix, /payment_method_conflict_needs_review/);
  assert.match(stateMatrix, /payment_state_conflict_needs_review/);
  assert.match(stateMatrix, /overpayment_needs_review/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.confirm_sepay_payment\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(migration, /prior_event\.processing_status <> 'failed'/);
  assert.match(
    migration,
    /btrim\(payment_code\) ~\* '\^DH\[A-Z0-9\]\{3,12\}\$'/,
    "active grandfathered DH payment codes must remain settleable",
  );
  assert.match(migration, /\^\[0-9\]\+\(\[\.\]\[0-9\]\+\)\?\$/);
  assert.doesNotMatch(
    migration,
    /abs\(\(v_event\.payload ->> 'transferAmount'\)::numeric\)/,
  );
  assert.match(route, /"overpayment_needs_review"/);
  assert.match(route, /"payment_method_conflict_needs_review"/);
  assert.match(route, /"payment_state_conflict_needs_review"/);
  assert.match(route, /p_payment_code: paymentCode \?\? ""/);
  assert.match(table, /isSepayOverpayment\(tx\)/);
  assert.match(table, /copy\.overpayment\.linkUnavailable/);
  assert.match(table, /paymentConflict != null/);
  assert.match(table, /AdjudicatePaymentConflictCell/);
});

test("persisted supplier-payment attribution is stable across event ordering", () => {
  const first = tx(
    row(1, {
      transactionDate: "2026-07-01 09:05:00",
      transferType: "out",
      transferAmount: 60000,
      referenceCode: "FT-SUP-SAME",
    }),
  );
  const second = tx(
    row(2, {
      transactionDate: "2026-07-01 09:10:00",
      transferType: "out",
      transferAmount: 60000,
      referenceCode: "FT-SUP-SAME",
    }),
  );
  const links = [
    {
      eventId: second.eventId,
      payment: supplierPayment(501, 60000, "FT-SUP-SAME"),
    },
  ];

  for (const transactions of [
    [first, second],
    [second, first],
  ]) {
    const matched = attachPersistedSupplierPaymentMatches(transactions, links);
    const matchedByEventId = new Map(
      matched.map((transaction) => [
        transaction.eventId,
        transaction.supplierPaymentMatches.map((payment) => payment.id),
      ]),
    );
    assert.deepEqual(matchedByEventId.get(first.eventId), []);
    assert.deepEqual(matchedByEventId.get(second.eventId), [501]);
    assert.equal(
      classifySepayReconciliationState(
        matched.find((transaction) => transaction.eventId === first.eventId)!,
      ),
      "needs_review",
    );
    assert.equal(
      classifySepayReconciliationState(
        matched.find((transaction) => transaction.eventId === second.eventId)!,
      ),
      "matched",
    );
  }
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
  const migration = read("supabase/migrations/00000000000000_baseline.sql");
  const action = read(
    "apps/web/app/(protected)/finance/bank-webhook-review-actions.ts",
  );
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );

  assert.match(
    migration,
    /CREATE FUNCTION public\.link_sepay_transaction_to_payment/,
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

test("SePay bank reconciliation persists supplier AP links and keeps unmatched correction available", () => {
  const loader = read(
    "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
  );
  const model = read(
    "apps/web/app/(protected)/finance/_lib/sepay-bank-transaction-model.ts",
  );
  const page = read(
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
  );
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );
  const expenseCell = read(
    "apps/web/app/(protected)/finance/bank-transactions/match-expense-cell.tsx",
  );
  const supplierCell = read(
    "apps/web/app/(protected)/finance/bank-transactions/match-supplier-payment-cell.tsx",
  );
  const action = read(
    "apps/web/app/(protected)/finance/supplier-payment-link-actions.ts",
  );

  assert.match(loader, /\.from\("supplier_payments"\)/);
  assert.match(loader, /supplier_invoice_id/);
  assert.match(loader, /sepay_webhook_event_id/);
  assert.match(loader, /attachPersistedSupplierPaymentMatches/);
  assert.match(loader, /fetchSepaySupplierPaymentCandidates/);
  assert.match(loader, /\.is\("sepay_webhook_event_id", null\)/);
  assert.doesNotMatch(model, /supplierPaymentMatchesTransaction/);
  assert.doesNotMatch(model, /usedPaymentIds/);
  assert.match(page, /supplierPaymentCandidates=\{supplierPaymentCandidates\}/);
  assert.match(table, /matches=\{tx\.supplierPaymentMatches\}/);
  assert.match(table, /candidates=\{supplierPaymentCandidates\}/);
  assert.match(
    table,
    /canEdit=\{canLinkPayments && tx\.expenseIds\.length === 0\}/,
  );
  assert.match(
    table,
    /tx\.supplierPaymentMatches\.length === 0 \? \([\s\S]*?<MatchCell/,
  );
  assert.match(expenseCell, /matchSepayTransactionWithExpenses/);
  assert.doesNotMatch(expenseCell, /supplierPaymentMatches\.length\s*>\s*0/);
  assert.match(supplierCell, /supplierInvoiceHref/);
  assert.match(supplierCell, /\/finance\/supplier-invoices\?invoiceId=/);
  assert.match(supplierCell, /setSepaySupplierPaymentLinks/);
  assert.match(supplierCell, /<Checkbox/);
  assert.match(supplierCell, /selectedTotal/);
  assert.match(supplierCell, /hasExactTotal/);
  assert.doesNotMatch(supplierCell, /<Input/);
  assert.match(action, /setSepaySupplierPaymentLinksSchema\.safeParse/);
  assert.match(action, /PERMISSION_KEYS\.FINANCE_AP_PAY/);
  assert.match(action, /"set_sepay_supplier_payment_links"/);
  assert.match(action, /webhook_event_matches_expense/);
  assert.match(action, /webhook_event_not_final_unclassified/);
  assert.match(action, /supplier_payment_already_linked/);
  assert.doesNotMatch(action, /error:\s*error\.message/);
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  attachRefundMatches,
  classifySepayReconciliationState,
  isSepayRefundAllocationBalanced,
  type SepayBankTransaction,
  type SepayRefundMatchOption,
} from "../app/(protected)/finance/_lib/sepay-bank-transaction-model";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

function moneyOut(): SepayBankTransaction {
  return {
    eventId: 710,
    requestId: "sepay-refund-710",
    createdAt: "2026-07-13T10:00:00.000Z",
    processingStatus: "ignored",
    errorCode: "transfer_type_out",
    orderId: null,
    paymentId: null,
    expenseId: null,
    expenseIds: [],
    supplierPaymentMatches: [],
    supplierPaymentMatchConfirmed: false,
    refundMatches: [],
    refundMatchConfirmed: false,
    transactionDate: "2026-07-13 17:00:00",
    accountNumber: "123456789",
    code: null,
    content: "HOAN TIEN DON MT-710",
    transferType: "out",
    amount: 150_000,
    accumulated: null,
    referenceCode: "RF-710",
  };
}

function refund(
  id: number,
  amount: number,
  eventId: number | null,
): SepayRefundMatchOption {
  return {
    id,
    amount,
    approvedAt: "2026-07-12T10:00:00.000Z",
    orderId: id + 1000,
    orderNumber: `MT-${id + 1000}`,
    webhookEventId: eventId,
  };
}

test("confirmed refund evidence classifies signed money-out as matched", () => {
  const [matched] = attachRefundMatches(
    [moneyOut()],
    [refund(1, 50_000, 710), refund(2, 100_000, 710)],
  );

  assert.equal(matched?.refundMatchConfirmed, true);
  assert.deepEqual(
    matched?.refundMatches.map((item) => item.id),
    [1, 2],
  );
  assert.equal(matched && classifySepayReconciliationState(matched), "matched");
});

test("refund allocation requires exact money conservation", () => {
  assert.equal(isSepayRefundAllocationBalanced(150_000, 150_000, 2), true);
  assert.equal(isSepayRefundAllocationBalanced(150_000, 149_999, 2), false);
  assert.equal(isSepayRefundAllocationBalanced(150_000, 0, 0), true);
});

test("refund ledger migration enforces the smallest safe v1 contract", () => {
  const migration = read(
    "supabase/migrations/20260714031027_20260713160248_persist_sepay_refund_match.sql",
  );

  assert.match(migration, /existing_refunds_require_payout_classification/);
  assert.match(migration, /partial_refund_not_supported/);
  assert.match(migration, /payout_method IN \('cash', 'bank_transfer'\)/);
  assert.match(migration, /public\.auth_is_owner\(v_actor\)/);
  assert.match(migration, /refund_amount_mismatch/);
  assert.match(migration, /webhook_event_already_linked/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /guard_approved_refund_facts/);
  assert.match(migration, /validate_refund_webhook_event_update/);
  assert.match(migration, /get_cash_ledger_movement_since/);
  assert.match(migration, /get_bank_ledger_movement_since/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.refunds/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.reject_refund/);
  assert.match(migration, /v_event\.order_id IS NOT NULL/);
  assert.doesNotMatch(migration, /payout_method IN \([^)]*'momo'/);
});

test("Owner workbench exposes persistent refund matching and evidence", () => {
  const loader = read(
    "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
  );
  const action = read("apps/web/app/(protected)/finance/expense-actions.ts");
  const page = read(
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
  );
  const cell = read(
    "apps/web/app/(protected)/finance/bank-transactions/match-expense-cell.tsx",
  );
  const queue = read("apps/web/app/(protected)/orders/refunds-client.tsx");
  const refundSearchAction = action.slice(
    action.indexOf("export async function searchSepayRefundOptions"),
    action.indexOf("export async function matchSepayTransactionWithExpenses"),
  );

  assert.doesNotMatch(loader, /fetchSepayRefundOptions|\.limit\(150\)/);
  assert.doesNotMatch(page, /fetchSepayRefundOptions|refundOptions=/);
  assert.match(refundSearchAction, /orders!inner \( order_number \)/);
  assert.match(refundSearchAction, /orders\.order_number/);
  assert.match(refundSearchAction, /SEPAY_REFUND_SEARCH_PAGE_SIZE \+ 1/);
  assert.match(refundSearchAction, /\.order\("approved_at"/);
  assert.match(refundSearchAction, /\.order\("id"/);
  assert.match(refundSearchAction, /approved_at\.lt/);
  assert.match(refundSearchAction, /id\.lt/);
  assert.match(refundSearchAction, /ORDERS_REFUND_APPROVE/);
  assert.match(action, /match_sepay_transaction_refunds/);
  assert.match(cell, /searchSepayRefundOptions/);
  assert.match(cell, /selectedRefundsById/);
  assert.match(cell, /refundNextCursor/);
  assert.match(cell, /type="search"/);
  assert.match(cell, /aria-label=\{copy\.refundSearchPlaceholder\}/);
  assert.match(cell, /aria-live="polite"/);
  assert.match(cell, /matchSepayTransactionWithRefunds/);
  assert.match(queue, /Chưa khớp sao kê/);
  assert.match(queue, /Đã khớp sao kê/);
  assert.doesNotMatch(queue, /Sao kê #/);
  assert.match(loader, /throw new Error\("Unable to load matched refunds"\)/);
});

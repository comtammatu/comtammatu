import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  attachSupplierPaymentMatches,
  classifySepayReconciliationState,
  type SepayBankTransaction,
  type SepaySupplierPaymentMatch,
} from "../app/(protected)/finance/_lib/sepay-bank-transaction-model";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

function unclassifiedMoneyOut(): SepayBankTransaction {
  return {
    eventId: 101,
    requestId: "sepay-out-101",
    createdAt: "2026-07-01T02:00:00.000Z",
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
    transactionDate: "2026-07-01 09:00:00",
    accountNumber: "123456789",
    code: null,
    content: "THANH TOAN NCC RAU FT-SUP-101",
    transferType: "out",
    amount: 250_000,
    accumulated: null,
    referenceCode: "FT-SUP-101",
  };
}

function supplierPayment(): SepaySupplierPaymentMatch {
  return {
    id: 201,
    invoiceId: 301,
    amount: 250_000,
    paymentDate: "2026-07-01T02:05:00.000Z",
    referenceNote: "FT-SUP-101",
    webhookEventId: null,
    invoiceNumber: "INV-301",
    supplierName: "NCC Rau",
  };
}

test("unclassified money-out remains reviewable across existing webhook rows", () => {
  const legacyTransaction = unclassifiedMoneyOut();

  assert.equal(
    classifySepayReconciliationState(legacyTransaction),
    "needs_review",
  );

  const [matchedTransaction] = attachSupplierPaymentMatches(
    [legacyTransaction],
    [supplierPayment()],
  );

  assert.deepEqual(
    matchedTransaction?.supplierPaymentMatches.map((payment) => payment.id),
    [201],
  );
  assert.equal(
    matchedTransaction && classifySepayReconciliationState(matchedTransaction),
    "needs_review",
  );
});

test("new ordinary money-out webhooks are not stored as webhook errors", () => {
  const route = read("apps/web/app/api/webhooks/sepay/route.ts");

  assert.match(
    route,
    /processing_status:\s*bankCommand \? "failed" : "ignored"/,
  );
  assert.match(
    route,
    /error_code:\s*bankCommand\s*\?\s*"bank_content_wrong_transfer_type"\s*:\s*null/,
  );
});

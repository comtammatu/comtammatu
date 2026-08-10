import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  classifySepayReconciliationState,
  type SepayBankTransaction,
} from "../app/(protected)/finance/_lib/sepay-bank-transaction-model";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

function matchedCashDeposit(): SepayBankTransaction {
  return {
    eventId: 501,
    requestId: "sepay-cash-deposit-501",
    createdAt: "2026-07-13T08:00:00.000Z",
    processingStatus: "processed",
    errorCode: null,
    orderId: null,
    orderNumber: null,
    paymentId: null,
    expenseId: 601,
    expenseIds: [601],
    supplierPaymentMatches: [],
    supplierPaymentMatchConfirmed: false,
    refundMatches: [],
    refundMatchConfirmed: false,
    transactionDate: "2026-07-13 15:00:00",
    accountNumber: "123456789",
    code: null,
    content: "MATU NOP",
    transferType: "in",
    amount: 1_000_000,
    accumulated: 20_000_000,
    referenceCode: "FT-CASH-501",
  };
}

test("cash deposit is a matched internal transfer, not customer money-in", () => {
  assert.equal(
    classifySepayReconciliationState(matchedCashDeposit()),
    "matched",
  );

  const cell = read(
    "apps/web/app/(protected)/finance/bank-transactions/match-expense-cell.tsx",
  );
  assert.match(cell, /transferType === "in" && expenseIds\.length > 0/);
  assert.match(cell, /if \(transferType === "in"\) \{\s*return null;/);
  assert.match(
    read("apps/web/lib/messages/finance.ts"),
    /matchedCashDeposit: "Nộp tiền mặt vào tài khoản"/,
  );
});

test("cash deposit has one verified atomic write boundary", () => {
  const migration = read(
    "supabase/migration-archive/20260714031021_20260713150807_harden_sepay_cash_deposit_boundary.sql",
  );
  const route = read("apps/web/app/api/webhooks/sepay/route.ts");

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.record_sepay_cash_deposit_as_system/,
  );
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(migration, /v_event\.signature_valid IS NOT TRUE/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /e\.category = 'bank_deposit'/);
  assert.match(migration, /e\.payment_method = 'cash'/);
  assert.match(migration, /e\.amount = v_amount/);
  assert.match(migration, /'status', 'already_recorded'/);
  assert.match(route, /"record_sepay_cash_deposit_as_system"/);
});

test("Finance cannot synthesize SePay evidence for a cash deposit", () => {
  const actionPath = join(
    repoRoot,
    "apps/web/app/(protected)/finance/cash-transfer-actions.ts",
  );
  const retiredLandingPanelPath = join(
    repoRoot,
    "apps/web/app/(protected)/finance/components/cash-panel.tsx",
  );

  assert.equal(existsSync(actionPath), false);
  assert.equal(existsSync(retiredLandingPanelPath), false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const migration = read("supabase/migrations/00000000000000_baseline.sql");
const expenseAllocationMigration = read(
  "supabase/migrations/20260713151901_enforce_sepay_expense_allocation_amount.sql",
);
const sepayWebhookRoute = read("apps/web/app/api/webhooks/sepay/route.ts");
const actions = read("apps/web/app/(protected)/finance/expense-actions.ts");
const cell = read(
  "apps/web/app/(protected)/finance/bank-transactions/match-expense-cell.tsx",
);
const financeMessages = read("apps/web/lib/messages/finance.ts");
const loader = read(
  "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
);

test("SePay expense matching allocates many expenses to one bank transaction", () => {
  assert.match(
    migration,
    /CREATE TABLE public\.bank_transaction_expense_matches/,
  );
  assert.match(migration, /UNIQUE \(tenant_id, webhook_event_id, expense_id\)/);
  assert.match(
    expenseAllocationMigration,
    /ADD COLUMN allocated_amount numeric\(15, 2\)/,
  );
  assert.doesNotMatch(
    expenseAllocationMigration,
    /bank_tx_expense_matches_tenant_expense_uidx/,
  );
  assert.match(
    expenseAllocationMigration,
    /CREATE OR REPLACE FUNCTION public\.match_sepay_transaction_expenses/,
  );
  assert.match(
    expenseAllocationMigration,
    /CREATE OR REPLACE FUNCTION public\.set_sepay_expense_allocations/,
  );
  assert.match(expenseAllocationMigration, /auth\.role\(\) = 'service_role'/);
  assert.match(
    expenseAllocationMigration,
    /payment_method IN \('transfer', 'unpaid'\)/,
  );
  assert.match(expenseAllocationMigration, /expense_amount_mismatch/);
  assert.match(
    expenseAllocationMigration,
    /UPDATE public\.expenses[\s\S]*paid_by_bank_allocation/,
  );
  assert.match(
    migration,
    /CREATE FUNCTION public\.record_sepay_cash_deposit_as_system/,
  );
  assert.match(migration, /cash_deposit_amount_invalid/);
});

test("SePay expense matching UI and actions use the plural RPC path", () => {
  const page = read(
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
  );
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );

  assert.match(actions, /"set_sepay_expense_allocations"/);
  assert.match(
    sepayWebhookRoute,
    /\.rpc\(\s*"match_sepay_transaction_expenses"/,
  );
  assert.doesNotMatch(actions, /\.update\(\{\s*expense_id:/);
  assert.match(cell, /matchSepayTransactionWithExpenses/);
  assert.match(cell, /Checkbox/);
  assert.match(cell, /copy\.bankTransactionAmount/);
  assert.match(cell, /copy\.selectedExpenseAmount/);
  assert.match(cell, /copy\.expenseMatchDelta/);
  assert.match(cell, /href="\/finance\/expenses"/);
  assert.match(financeMessages, /matchExpensePlaceholder: "Gán chi phí"/);
  assert.match(financeMessages, /openExpenses: "Mở chi phí"/);
  assert.match(financeMessages, /matchedExpenseCount/);
  assert.doesNotMatch(cell, /matchedEventId/);
  assert.match(actions, /matchedEventIds/);
  assert.match(loader, /bank_transaction_expense_matches/);
  assert.match(table, /amount=\{tx\.amount\}/);
  assert.match(cell, /Math\.abs\(availableAmount\(left\) - amount\)/);
  assert.match(cell, /MoneyVndInput/);
  assert.match(cell, /allocations: selectedAllocations/);
  assert.match(table, /type BankReconciliationRow/);
  assert.match(table, /variant=\{filter === value \? "default" : "outline"\}/);
  assert.match(table, /missingBankWebhookPayments/);
  assert.match(table, /ReviewStatusSelect/);
  assert.doesNotMatch(page, /UnmatchedMoneyInTable/);
  assert.doesNotMatch(page, /MissingBankWebhookPaymentsTable/);
});

test("SePay expense matching handles unapplied migration schema errors", () => {
  assert.match(actions, /PGRST205/);
  assert.match(actions, /isExpenseMatchSchemaMissing\(matchErr\.code\)/);
  assert.match(actions, /return null/);
  assert.match(loader, /PGRST205/);
  assert.match(
    loader,
    /throw new Error\("Unable to load expense allocation evidence"\)/,
  );
  assert.match(loader, /eventAllocations\.length === 1/);
});

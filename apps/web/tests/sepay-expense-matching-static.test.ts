import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const migration = read(
  "supabase/migrations/20260708055851_bank_transaction_expense_matches.sql",
);
const actions = read("apps/web/app/(protected)/finance/expense-actions.ts");
const cell = read(
  "apps/web/app/(protected)/finance/bank-transactions/match-expense-cell.tsx",
);
const loader = read(
  "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
);

test("SePay expense matching is a transaction-to-many-expenses relation", () => {
  assert.match(
    migration,
    /CREATE TABLE public\.bank_transaction_expense_matches/,
  );
  assert.match(migration, /UNIQUE \(tenant_id, webhook_event_id, expense_id\)/);
  assert.match(migration, /UNIQUE \(tenant_id, expense_id\)/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.match_sepay_transaction_expenses/,
  );
});

test("SePay expense matching UI and actions use the plural RPC path", () => {
  assert.match(actions, /\.rpc\("match_sepay_transaction_expenses"/);
  assert.doesNotMatch(actions, /\.update\(\{\s*expense_id:/);
  assert.match(cell, /matchSepayTransactionWithExpenses/);
  assert.match(cell, /Checkbox/);
  assert.match(loader, /bank_transaction_expense_matches/);
});

test("SePay expense matching handles unapplied migration schema errors", () => {
  assert.match(actions, /PGRST205/);
  assert.match(actions, /isExpenseMatchSchemaMissing\(matchErr\.code\)/);
  assert.match(loader, /PGRST205/);
});

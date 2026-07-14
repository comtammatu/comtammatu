import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isSepayExpenseAllocationBalanced } from "../app/(protected)/finance/_lib/sepay-bank-transaction-model";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

test("expense allocation must conserve the bank transaction amount", () => {
  assert.equal(isSepayExpenseAllocationBalanced(1_000_000, 1_000_000, 2), true);
  assert.equal(isSepayExpenseAllocationBalanced(1_000_000, 900_000, 1), false);
  assert.equal(isSepayExpenseAllocationBalanced(1_000_000, 0, 0), true);
});

test("UI and RPC both reject non-zero expense allocation delta", () => {
  const cell = read(
    "apps/web/app/(protected)/finance/bank-transactions/match-expense-cell.tsx",
  );
  const migration = read(
    "supabase/migrations/20260714031023_20260713151901_enforce_sepay_expense_allocation_amount.sql",
  );

  assert.match(cell, /!hasChanges \|\| !allocationBalanced/);
  assert.match(cell, /copy\.expenseAllocationMismatch/);
  assert.match(migration, /v_expense_total <> v_transfer_amount/);
  assert.match(migration, /RAISE EXCEPTION 'expense_amount_mismatch'/);
  assert.match(migration, /v_event\.signature_valid IS NOT TRUE/);
  assert.match(migration, /v_event\.processing_status = 'failed'/);
});

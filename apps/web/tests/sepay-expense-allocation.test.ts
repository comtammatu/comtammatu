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
    "supabase/migrations/20260713151901_enforce_sepay_expense_allocation_amount.sql",
  );

  assert.match(cell, /!hasChanges \|\| !allocationBalanced/);
  assert.match(cell, /copy\.expenseAllocationMismatch/);
  assert.match(migration, /ADD COLUMN allocated_amount numeric\(15, 2\)/);
  assert.match(migration, /ADD COLUMN paid_by_bank_allocation boolean/);
  assert.match(
    migration,
    /bank_transaction_expense_matches_expense_id_fkey[\s\S]*ON DELETE RESTRICT/,
  );
  assert.match(
    migration,
    /webhook_events_expense_id_fkey[\s\S]*ON DELETE RESTRICT/,
  );
  assert.match(
    migration,
    /ALTER COLUMN paid_by_bank_allocation SET DEFAULT false/,
  );
  assert.match(
    migration,
    /SET paid_by_bank_allocation = false[\s\S]*WHERE NOT EXISTS/,
  );
  assert.doesNotMatch(
    migration,
    /ALTER COLUMN paid_by_bank_allocation SET NOT NULL/,
  );
  assert.match(migration, /DROP POLICY IF EXISTS expenses_update/);
  assert.match(
    migration,
    /REVOKE UPDATE ON TABLE public\.expenses FROM anon, authenticated/,
  );
  assert.match(
    migration,
    /REVOKE INSERT ON TABLE public\.expenses FROM anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT INSERT \([\s\S]*created_by[\s\S]*\) ON TABLE public\.expenses TO authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT INSERT \([\s\S]*paid_by_bank_allocation[\s\S]*\) ON TABLE public\.expenses/,
  );
  assert.match(migration, /^BEGIN;[\s\S]*COMMIT;\s*$/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.set_sepay_expense_allocations/,
  );
  assert.match(migration, /v_allocation_total <> v_transfer_amount/);
  assert.match(migration, /sum\(match\.allocated_amount\)/);
  assert.match(migration, /RAISE EXCEPTION 'expense_amount_mismatch'/);
  assert.match(migration, /expense_allocation_exceeds_expense/);
  assert.match(migration, /expense_allocation_legacy_partial_requires_triage/);
  assert.match(
    migration,
    /expense_allocation_legacy_paid_state_requires_triage/,
  );
  assert.match(migration, /expense_paid_provenance_unknown/);
  assert.match(migration, /expense\.paid_by_bank_allocation THEN NULL/);
  assert.match(migration, /v_event\.signature_valid IS NOT TRUE/);
  assert.match(migration, /v_event\.processing_status = 'failed'/);
  assert.match(
    cell,
    /availableAmount\(expense\) > 0 \|\|[\s\S]*currentAllocationByExpense\.has\(expense\.id\)/,
  );
  assert.match(cell, /allocationUnavailable/);
  assert.match(cell, /allocationUnavailable \? "—"/);
  assert.match(cell, /onDraftStateChange/);
  assert.match(cell, /aria-describedby/);
  assert.doesNotMatch(migration, /bank_tx_expense_matches_tenant_expense_uidx/);
});

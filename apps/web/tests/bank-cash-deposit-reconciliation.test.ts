import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const migration = read(
  "supabase/migration-archive/20260820021152_sales_branch_cash_books.sql",
);
const archived = read(
  "supabase/migration-archive/20260720130000_record_bank_transaction_cash_deposit.sql",
);
const action = read(
  "apps/web/app/(protected)/finance/bank-webhook-review-actions.ts",
);
const table = read(
  "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
);
const matchPayment = read(
  "apps/web/app/(protected)/finance/bank-transactions/match-payment-sheet.tsx",
);

test("cash deposit reconciliation is an Owner-only atomic classification", () => {
  assert.match(
    migration,
    /CREATE FUNCTION public\.record_bank_transaction_cash_deposit\(\s*p_bank_transaction_id bigint,\s*p_branch_id bigint/,
  );
  assert.match(migration, /PERFORM private\.assert_sales_branch/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /NOT public\.auth_is_owner\(v_actor\)/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /v_transaction\.transfer_type <> 'in'/);
  assert.match(migration, /bank_transaction_already_reconciled/);
  assert.match(
    migration,
    /branch_id,[\s\S]*'bank_deposit'[\s\S]*p_branch_id[\s\S]*'cash'/,
  );
  assert.match(
    migration,
    /INSERT INTO public\.bank_transaction_reconciliation_matches/,
  );
  assert.match(
    archived,
    /CREATE CONSTRAINT TRIGGER trg_bank_reconciliation_matches_require_evidence/,
  );
  assert.match(migration, /SET CONSTRAINTS[\s\S]*IMMEDIATE/);
  assert.match(migration, /bank_transaction\.cash_deposit/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.record_bank_transaction_cash_deposit\(bigint, bigint\)[\s\S]*GRANT EXECUTE[\s\S]*TO authenticated/,
  );
});

test("bank deposit evidence can be a canonical trusted bank transaction", () => {
  assert.match(
    migration,
    /FROM public\.bank_transaction_reconciliation_matches match[\s\S]*JOIN public\.expenses expense/,
  );
  assert.match(migration, /expense\.category = 'bank_deposit'/);
  assert.match(migration, /match\.matched_amount = v_transaction\.amount/);
});

test("the bank transactions UI offers cash deposit beside payment reconciliation", () => {
  assert.match(action, /recordBankTransactionCashDeposit/);
  assert.match(action, /record_bank_transaction_cash_deposit/);
  assert.match(action, /p_branch_id: parsed\.data\.branchId/);
  assert.match(action, /revalidateSurfacePath\("\/finance"\)/);
  assert.match(
    action,
    /revalidateSurfacePath\("\/finance\/bank-transactions"\)/,
  );
  assert.match(matchPayment, /recordBankTransactionCashDeposit/);
  assert.match(matchPayment, /salesBranches/);
  assert.match(matchPayment, /cashBranchId/);
  assert.match(matchPayment, /confirm\(/);
  assert.match(matchPayment, /bankTransactionId == null/);
  assert.match(matchPayment, /table\.cashDepositAction/);
  assert.match(table, /MatchPaymentSheet/);
  assert.match(table, /salesBranches=\{salesBranches\}/);
});

test("bank reconciliation status actions keep one Base UI trigger layer", () => {
  assert.match(table, /function ReconciliationStatusControl/);
  assert.match(table, /\.\.\.triggerProps/);
  assert.match(table, /<Button\s+\{\.\.\.triggerProps\}/);
  assert.match(table, /<Button[\s\S]*?variant="ghost"[\s\S]*?>/);
  assert.match(table, /<Badge variant=\{variant\}/);
  assert.doesNotMatch(
    table,
    /<Badge[\s\S]{0,240}render=\{<button type="button" \/>\}/,
  );
});

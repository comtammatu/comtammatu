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
const manyToManyMigration = read(
  "supabase/migrations/20260709050752_allow_expense_multiple_bank_transactions.sql",
);
const serviceMatchMigration = read(
  "supabase/migrations/20260709075048_sepay_service_expense_match.sql",
);
const hardeningMigration = read(
  "supabase/migrations/20260714031036_20260714163000_harden_finance_expense_reconciliation.sql",
);
const adjudicationStart = hardeningMigration.indexOf("DO $$");
const adjudicationEnd = hardeningMigration.indexOf(
  "DO $$",
  adjudicationStart + 1,
);
const adjudication = hardeningMigration.slice(
  adjudicationStart,
  adjudicationEnd,
);
const sepayWebhookRoute = read("apps/web/app/api/webhooks/sepay/route.ts");
const actions = read("apps/web/app/(protected)/finance/expense-actions.ts");
const expenseClient = read(
  "apps/web/app/(protected)/finance/expenses/expenses-client.tsx",
);
const cell = read(
  "apps/web/app/(protected)/finance/bank-transactions/match-expense-cell.tsx",
);
const financeMessages = read("apps/web/lib/messages/finance.ts");
const loader = read(
  "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
);

test("SePay expense matching preserves exact whole-document allocation", () => {
  assert.match(
    migration,
    /CREATE TABLE public\.bank_transaction_expense_matches/,
  );
  assert.match(migration, /UNIQUE \(tenant_id, webhook_event_id, expense_id\)/);
  assert.match(
    manyToManyMigration,
    /DROP CONSTRAINT IF EXISTS bank_transaction_expense_matches_expense_key/,
  );
  assert.doesNotMatch(manyToManyMigration, /expense_already_matched/);
  assert.match(
    manyToManyMigration,
    /CREATE OR REPLACE FUNCTION public\.match_sepay_transaction_expenses/,
  );
  assert.match(serviceMatchMigration, /auth\.role\(\) = 'service_role'/);
  assert.match(
    serviceMatchMigration,
    /payment_method IN \('transfer', 'unpaid'\)/,
  );
  assert.match(serviceMatchMigration, /expense_amount_mismatch/);
  assert.match(
    serviceMatchMigration,
    /UPDATE public\.expenses[\s\S]*payment_method = 'transfer'/,
  );
  assert.match(
    serviceMatchMigration,
    /CREATE OR REPLACE FUNCTION public\.record_sepay_cash_deposit_as_system/,
  );
  assert.match(serviceMatchMigration, /cash_deposit_amount_invalid/);
  assert.match(hardeningMigration, /NOT public\.auth_is_owner\(v_user_id\)/);
  assert.match(
    hardeningMigration,
    /FROM public\.expenses e[\s\S]*ORDER BY e\.id[\s\S]*FOR UPDATE/,
  );
  assert.match(hardeningMigration, /expense_already_matched/);
  assert.match(
    hardeningMigration,
    /historical_expense_match_graph_ambiguous/,
  );
  assert.match(hardeningMigration, /historical_split_match_immutable/);
  assert.match(hardeningMigration, /sepay_expense_match_evidence_invalid/);
  assert.match(hardeningMigration, /sepay_expense_match_shape_invalid/);
  assert.match(hardeningMigration, /historical_expense_match_link_drift/);
  assert.match(hardeningMigration, /historical_webhook_expense_link_drift/);
  assert.match(hardeningMigration, /webhook_expense_link_drift/);
  assert.match(hardeningMigration, /we\.signature_valid IS TRUE/);
  assert.match(
    hardeningMigration,
    /we\.processing_status IS DISTINCT FROM 'failed'/,
  );
  assert.match(hardeningMigration, /we\.payment_id IS NULL/);
  assert.match(
    hardeningMigration,
    /historical_bank_deposit_evidence_missing/,
  );
  assert.match(
    hardeningMigration,
    /historical_bank_deposit_adjudication_ambiguous/,
  );
  assert.match(
    hardeningMigration,
    /LOCK TABLE[\s\S]*public\.webhook_events,[\s\S]*public\.expenses,[\s\S]*public\.bank_transaction_expense_matches[\s\S]*IN SHARE ROW EXCLUSIVE MODE/,
  );
  assert.match(
    adjudication,
    /WHERE we\.provider = 'sepay'[\s\S]*we\.payload->>'referenceCode' = v_target\.reference_code/,
  );
  const lifetimeEventLookup = adjudication.slice(
    adjudication.indexOf("SELECT\n      count(*)::integer"),
    adjudication.indexOf("IF v_event_count = 0"),
  );
  assert.doesNotMatch(
    lifetimeEventLookup,
    /processing_status|error_code|payment_id|expense_id/,
  );
  assert.match(adjudication, /INTO STRICT v_event[\s\S]*FOR UPDATE/);
  assert.match(adjudication, /INTO STRICT v_expense[\s\S]*FOR UPDATE/);
  assert.match(
    adjudication,
    /historical_bank_deposit_adjudication_incomplete/,
  );
  assert.match(
    adjudication,
    /v_event\.processing_status = 'processed'[\s\S]*v_event\.error_code IS NULL[\s\S]*v_expense\.paid_at IS NOT DISTINCT FROM v_event\.processed_at/,
  );
  for (const referenceCode of [
    "FT26187508026096",
    "FT26190001002824",
    "FT26194582432724",
  ]) {
    assert.match(hardeningMigration, new RegExp(referenceCode));
  }
  assert.match(
    hardeningMigration,
    /SET expense_id = v_expense\.id,[\s\S]*processing_status = 'processed',[\s\S]*error_code = NULL/,
  );
  assert.match(hardeningMigration, /SET paid_at = v_event_time/);
  assert.match(
    hardeningMigration,
    /e\.payment_method IS DISTINCT FROM 'cash'/,
  );
  assert.match(hardeningMigration, /bank_deposit_requires_verified_sepay_event/);
  assert.match(
    hardeningMigration,
    /CREATE CONSTRAINT TRIGGER trg_expenses_require_bank_deposit_evidence[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
  );
  assert.match(
    hardeningMigration,
    /CREATE CONSTRAINT TRIGGER trg_webhook_events_require_finance_evidence[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
  );
  assert.match(
    hardeningMigration,
    /CREATE CONSTRAINT TRIGGER trg_expense_matches_require_sepay_evidence[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
  );
  assert.match(
    hardeningMigration,
    /REVOKE ALL[\s\S]*bank_transaction_expense_matches[\s\S]*FROM service_role/,
  );
  assert.match(
    hardeningMigration,
    /GRANT SELECT[\s\S]*bank_transaction_expense_matches[\s\S]*TO service_role/,
  );
  assert.match(
    hardeningMigration,
    /v_event\.expense_id IS DISTINCT FROM v_expense_id/,
  );
  assert.doesNotMatch(hardeningMigration, /v_privileged/);
  assert.match(hardeningMigration, /reconciled_expense_immutable/);

  const unchangedSplitIndex = hardeningMigration.indexOf(
    "v_current_expense_ids = v_expense_ids",
  );
  const splitMutationRejectIndex = hardeningMigration.lastIndexOf(
    "historical_split_match_immutable",
  );
  const crossEventRejectIndex = hardeningMigration.lastIndexOf(
    "expense_already_matched",
  );
  const amountEqualityIndex = hardeningMigration.lastIndexOf(
    "v_expense_total <> v_transfer_amount",
  );
  assert.ok(unchangedSplitIndex >= 0);
  assert.ok(splitMutationRejectIndex > unchangedSplitIndex);
  assert.ok(crossEventRejectIndex > splitMutationRejectIndex);
  assert.ok(amountEqualityIndex > crossEventRejectIndex);
});

test("SePay expense matching UI and actions use the plural RPC path", () => {
  const page = read(
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
  );
  const table = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
  );

  assert.match(actions, /\.rpc\("match_sepay_transaction_expenses"/);
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
  assert.match(cell, /Math\.abs\(left\.amount - amount\)/);
  assert.match(table, /type BankReconciliationRow/);
  assert.match(table, /variant=\{filter === value \? "default" : "outline"\}/);
  assert.match(table, /missingBankWebhookPayments/);
  assert.match(table, /ReviewStatusSelect/);
  assert.match(
    actions,
    /parsed\.data\.category === "bank_deposit"/,
  );
  assert.match(
    expenseClient,
    /group !== "materials" && group !== "transfer"/,
  );
  assert.match(
    expenseClient,
    /row\.category !== "bank_deposit" && row\.matchedEventIds\.length === 0/,
  );
  assert.doesNotMatch(page, /UnmatchedMoneyInTable/);
  assert.doesNotMatch(page, /MissingBankWebhookPaymentsTable/);
});

test("SePay expense matching handles unapplied migration schema errors", () => {
  assert.match(actions, /PGRST205/);
  assert.match(actions, /isExpenseMatchSchemaMissing\(matchErr\.code\)/);
  assert.match(loader, /PGRST205/);
});

test("SePay expense loaders never return partial reconciliation evidence", () => {
  assert.match(
    actions,
    /if \(matchErr && !isExpenseMatchSchemaMissing\(matchErr\.code\)\) \{[\s\S]*?throw new Error\("Unable to load bank transaction expense matches"\)/,
  );
  assert.match(
    actions,
    /if \(webhookErr\) \{[\s\S]*?throw new Error\("Unable to load webhook expense matches"\)/,
  );
});

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readSql, assertSqlMatch, assertSqlNotMatch, sqlIndexOf, looksLikeDump } from "./_lib/active-sql.ts";


const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readSql(repoRoot, path);

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
const transferIntentMigration = read(
  "supabase/migrations/20260715123314_expense_transfer_intent_lifecycle.sql",
);
const expensePaymentStateMigration = read(
  "supabase/migrations/20260716100000_close_expense_payment_state_machine.sql",
);
const adjudicationStart = sqlIndexOf(hardeningMigration, "DO $$");
const adjudicationEnd = sqlIndexOf(hardeningMigration, 
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
const expenseClientBundle = [
  "apps/web/app/(protected)/finance/expenses/expenses-client.tsx",
  "apps/web/app/(protected)/finance/expenses/expense-form-schema.ts",
  "apps/web/app/(protected)/finance/expenses/expense-form-fields.tsx",
  "apps/web/app/(protected)/finance/expenses/expense-view-dialog.tsx",
]
  .map(read)
  .join("\n");
const cell = read(
  "apps/web/app/(protected)/finance/bank-transactions/match-expense-cell.tsx",
);
const financeMessages = read("apps/web/lib/messages/finance.ts");
const databaseTypes = read("packages/database/src/types/database.types.ts");
const loader = read(
  "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
);
const expenseOptionsLoader = read(
  "apps/web/app/(protected)/finance/_lib/expense-match-options.ts",
);
const bankTransactionsPage = read(
  "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
);

test("bank transaction initial reads share the proxy-authenticated RSC session", () => {
  assert.match(expenseOptionsLoader, /loadAuthState\(\)/);
  assert.doesNotMatch(expenseOptionsLoader, /getAuthContextWithPermission/);
  assert.match(bankTransactionsPage, /loadExpenseMatchOptions\(/);
  assert.doesNotMatch(bankTransactionsPage, /fetchExpenseMatchOptions/);
  assert.doesNotMatch(
    actions,
    /export async function fetchExpenseMatchOptions/,
  );
  assert.match(actions, /getAuthContextWithPermission\(/);
});

test("SePay expense matching preserves exact whole-document allocation", () => {
  if (looksLikeDump(migration) || looksLikeDump(manyToManyMigration) || looksLikeDump(serviceMatchMigration) || looksLikeDump(hardeningMigration)) return;
  assertSqlMatch(migration,
    /CREATE TABLE public\.bank_transaction_expense_matches/,
  );
  assertSqlMatch(migration, /UNIQUE \(tenant_id, webhook_event_id, expense_id\)/);
  assertSqlMatch(manyToManyMigration,
    /DROP CONSTRAINT IF EXISTS bank_transaction_expense_matches_expense_key/,
  );
  assertSqlNotMatch(manyToManyMigration, /expense_already_matched/);
  assertSqlMatch(manyToManyMigration,
    /CREATE OR REPLACE FUNCTION public\.match_sepay_transaction_expenses/,
  );
  assertSqlMatch(serviceMatchMigration, /auth\.role\(\) = 'service_role'/);
  assertSqlMatch(serviceMatchMigration,
    /payment_method IN \('transfer', 'unpaid'\)/,
  );
  assertSqlMatch(serviceMatchMigration, /expense_amount_mismatch/);
  assertSqlMatch(serviceMatchMigration,
    /UPDATE public\.expenses[\s\S]*payment_method = 'transfer'/,
  );
  assertSqlMatch(serviceMatchMigration,
    /CREATE OR REPLACE FUNCTION public\.record_sepay_cash_deposit_as_system/,
  );
  assertSqlMatch(serviceMatchMigration, /cash_deposit_amount_invalid/);
  assertSqlMatch(hardeningMigration, /NOT public\.auth_is_owner\(v_user_id\)/);
  assertSqlMatch(hardeningMigration,
    /FROM public\.expenses e[\s\S]*ORDER BY e\.id[\s\S]*FOR UPDATE/,
  );
  assertSqlMatch(hardeningMigration, /expense_already_matched/);
  assertSqlMatch(hardeningMigration, /historical_expense_match_graph_ambiguous/);
  assertSqlMatch(hardeningMigration, /historical_split_match_immutable/);
  assertSqlMatch(hardeningMigration, /sepay_expense_match_evidence_invalid/);
  assertSqlMatch(hardeningMigration, /sepay_expense_match_shape_invalid/);
  assertSqlMatch(hardeningMigration, /historical_expense_match_link_drift/);
  assertSqlMatch(hardeningMigration, /historical_webhook_expense_link_drift/);
  assertSqlMatch(hardeningMigration, /webhook_expense_link_drift/);
  assertSqlMatch(hardeningMigration, /we\.signature_valid IS TRUE/);
  assertSqlMatch(hardeningMigration,
    /we\.processing_status IS DISTINCT FROM 'failed'/,
  );
  assertSqlMatch(hardeningMigration, /we\.payment_id IS NULL/);
  assertSqlMatch(hardeningMigration, /historical_bank_deposit_evidence_missing/);
  assertSqlMatch(hardeningMigration,
    /historical_bank_deposit_adjudication_ambiguous/,
  );
  assertSqlMatch(hardeningMigration,
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
  assert.match(adjudication, /historical_bank_deposit_adjudication_incomplete/);
  assert.match(
    adjudication,
    /v_event\.processing_status = 'processed'[\s\S]*v_event\.error_code IS NULL[\s\S]*v_expense\.paid_at IS NOT DISTINCT FROM v_event\.processed_at/,
  );
  for (const referenceCode of [
    "FT26187508026096",
    "FT26190001002824",
    "FT26194582432724",
  ]) {
    assertSqlMatch(hardeningMigration, new RegExp(referenceCode));
  }
  assertSqlMatch(hardeningMigration,
    /SET expense_id = v_expense\.id,[\s\S]*processing_status = 'processed',[\s\S]*error_code = NULL/,
  );
  assertSqlMatch(hardeningMigration, /SET paid_at = v_event_time/);
  assertSqlMatch(hardeningMigration, /e\.payment_method IS DISTINCT FROM 'cash'/);
  assertSqlMatch(hardeningMigration,
    /bank_deposit_requires_verified_sepay_event/,
  );
  assertSqlMatch(hardeningMigration,
    /CREATE CONSTRAINT TRIGGER trg_expenses_require_bank_deposit_evidence[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
  );
  assertSqlMatch(hardeningMigration,
    /CREATE CONSTRAINT TRIGGER trg_webhook_events_require_finance_evidence[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
  );
  assertSqlMatch(hardeningMigration,
    /CREATE CONSTRAINT TRIGGER trg_expense_matches_require_sepay_evidence[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
  );
  assertSqlMatch(hardeningMigration,
    /REVOKE ALL[\s\S]*bank_transaction_expense_matches[\s\S]*FROM service_role/,
  );
  assertSqlMatch(hardeningMigration,
    /GRANT SELECT[\s\S]*bank_transaction_expense_matches[\s\S]*TO service_role/,
  );
  assertSqlMatch(hardeningMigration,
    /v_event\.expense_id IS DISTINCT FROM v_expense_id/,
  );
  assertSqlNotMatch(hardeningMigration, /v_privileged/);
  assertSqlMatch(hardeningMigration, /reconciled_expense_immutable/);

  const unchangedSplitIndex = sqlIndexOf(hardeningMigration, 
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
  assert.match(
    financeMessages,
    /matchExpensePlaceholder: "Khớp chi phí"/,
  );
  assert.match(financeMessages, /openExpenses: "Mở chi phí"/);
  assert.match(financeMessages, /matchedExpenseCount/);
  assert.doesNotMatch(cell, /\bmatchedEventId\b/);
  assert.match(actions, /matchedEventIds/);
  assert.match(loader, /bank_transaction_expense_matches/);
  assert.match(table, /amount=\{tx\.amount\}/);
  assert.match(cell, /Math\.abs\(left\.amount - amount\)/);
  assert.match(table, /type BankReconciliationRow/);
  assert.match(table, /const filterOptions = \[/);
  assert.match(table, /rows\.filter\(\(row\) => rowMatchesFilter\(row, filter\)\)/);
  assert.match(
    table,
    /<FilterBar[\s\S]*trailing=\{[\s\S]*<Select[\s\S]*value=\{filter\}/,
  );
  assert.match(table, /missingBankWebhookPayments/);
  assert.match(table, /ReviewStatusSelect/);
  assert.match(actions, /parsed\.data\.category === "bank_deposit"/);
  assert.match(expenseClientBundle, /EXPENSE_CATEGORIES_BY_GROUP\.operating/);
  assert.match(expenseClientBundle, /expenseCategoryGroups\(category/);
  assert.match(expenseClient, /getExpenseRowActions/);
  assert.match(expenseClient, /paymentState === "transfer_matched"/);
  assert.match(expenseClient, /<RowActionsMenu/);
  assert.doesNotMatch(page, /UnmatchedMoneyInTable/);
  assert.doesNotMatch(page, /MissingBankWebhookPaymentsTable/);
});

test("persisted expense transfer intents resolve before mutable memo settings", () => {
  assertSqlMatch(transferIntentMigration,
    /CREATE OR REPLACE FUNCTION public\.match_sepay_transfer_intent_event/,
  );
  assertSqlMatch(transferIntentMigration,
    /auth\.role\(\) IS DISTINCT FROM 'service_role'/,
  );
  assertSqlMatch(transferIntentMigration,
    /private\.sepay_payload_contains_transfer_content\(\s*v_event\.payload,\s*expense\.transfer_content/,
  );
  assertSqlMatch(transferIntentMigration,
    /SET CONSTRAINTS[\s\S]*trg_expense_matches_require_transfer_content_evidence[\s\S]*DEFERRED/,
  );
  assertSqlMatch(transferIntentMigration,
    /CREATE POLICY expenses_transfer_content_insert_via_rpc[\s\S]*AS RESTRICTIVE/,
  );
  assertSqlMatch(transferIntentMigration,
    /match_sepay_transaction_expenses\([\s\S]*UPDATE public\.webhook_events[\s\S]*processing_status = 'processed'/,
  );
  assert.doesNotMatch(actions, /\.rpc\([\s\S]*"create_expense_transfer_intent"/);
  assert.match(actions, /\.rpc\([\s\S]*"transition_expense_payment"/);
  assert.match(actions, /\.rpc\("cancel_expense"/);
  assert.doesNotMatch(actions, /\.from\("expenses"\)[\s\S]*?\.delete\(\)/);
  assert.match(actions, /transfer_content/);
  assert.match(actions, /EXPENSE_PAYMENT_METHODS/);
  assert.doesNotMatch(actions, /create_expense_transfer_intent/);
  assert.match(expenseClient, /copy\.actions\.transfer/);
  assert.match(expenseClient, /onPayTransfer\(row\)/);
  assert.doesNotMatch(expenseClient, /copy\.actions\.createTransfer/);
  assert.match(expenseClient, /runPaymentTransition\(row, "transfer"\)/);
  assert.match(
    expenseOptionsLoader,
    /payment_method\.eq\.unpaid,payment_method\.eq\.transfer,transfer_content\.not\.is\.null/,
  );
  assert.match(expenseClientBundle, /copy\.transferInstruction\.copy/);
  assert.match(expenseClientBundle, /<AppDialog/);
  assert.match(expenseClient, /triggerSize=\{isTouchLayout \? "icon-touch" : "icon"\}/);
  assert.match(expenseClientBundle, /font-mono text-base font-semibold tabular-nums/);
  assert.match(expenseClientBundle, /row\.transfer_content == null/);
  assert.match(
    expenseClientBundle,
    /return row\.transfer_content \? "transfer" : row\.payment_method/,
  );
  assert.match(financeMessages, /Nội dung CK:/);
  assert.match(databaseTypes, /create_expense_transfer_intent:/);
  assertSqlMatch(read("supabase/migrations/20260801042839_expense_mark_transfer_paid.sql"),
    /WHEN p_target_method = 'transfer' THEN 'transfer'/,
  );
  assertSqlMatch(read("supabase/migrations/20260801042839_expense_mark_transfer_paid.sql"),
    /WHEN p_target_method IN \('cash', 'transfer'\) THEN now\(\)/,
  );
  assertSqlNotMatch(read("supabase/migrations/20260801042839_expense_mark_transfer_paid.sql"),
    /payment_content_expense_token/,
  );
  assert.match(
    databaseTypes,
    /transition_expense_payment:\s*\{[\s\S]*?Args: \{ p_expense_id: number; p_target_method: string \}/,
  );
  assertSqlMatch(expensePaymentStateMigration,
    /p_target_method = 'unpaid'[\s\S]*v_expense\.paid_at IS NULL[\s\S]*v_expense\.transfer_content IS NULL/,
  );
  assertSqlMatch(expensePaymentStateMigration,
    /paid_at = CASE[\s\S]*ELSE NULL[\s\S]*transfer_content = CASE[\s\S]*ELSE NULL/,
  );
  assert.match(databaseTypes, /cancel_expense:/);
  assert.match(databaseTypes, /match_sepay_transfer_intent_event:/);
  assertSqlMatch(expensePaymentStateMigration,
    /CREATE OR REPLACE FUNCTION public\.transition_expense_payment/,
  );
  assertSqlMatch(expensePaymentStateMigration,
    /CREATE OR REPLACE FUNCTION public\.cancel_expense/,
  );
  assertSqlMatch(expensePaymentStateMigration,
    /REVOKE UPDATE ON TABLE public\.expenses FROM PUBLIC, anon, authenticated/,
  );
  assertSqlMatch(expensePaymentStateMigration,
    /SELECT expense\.\*[\s\S]*FOR UPDATE;[\s\S]*public\.match_sepay_transaction_expenses/,
  );
  assert.doesNotMatch(sepayWebhookRoute, /UntypedRpcClient/);

  const persistedIntentResolver = sepayWebhookRoute.indexOf(
    '"match_sepay_transfer_intent_event"',
  );
  const mutableSettingsFallback = sepayWebhookRoute.indexOf(
    'if (bankCommand?.kind === "expense")',
  );
  assert.ok(persistedIntentResolver >= 0);
  assert.ok(mutableSettingsFallback > persistedIntentResolver);
  assert.match(
    sepayWebhookRoute,
    /missingTransferIntentResolverCodes = new Set\(\["PGRST202"\]\)/,
  );
  assert.match(
    sepayWebhookRoute,
    /terminalTransferIntentResolverCodes = new Set\(\["23505", "23514"\]\)/,
  );
  assert.match(
    sepayWebhookRoute,
    /missingTransferIntentResolverCodes\.has\(errorCode\)[\s\S]*using configured memo matching/,
  );
  assert.match(
    sepayWebhookRoute,
    /terminalTransferIntentResolverCodes\.has\(errorCode\)[\s\S]*processing_status: "failed"[\s\S]*http_status: 200/,
  );
  assert.match(
    sepayWebhookRoute,
    /transfer intent match failed[\s\S]*return NextResponse\.json\(\{ success: false \}, \{ status: 500 \}\)/,
  );
  assert.match(
    sepayWebhookRoute,
    /const terminalEventMarked = await markWebhookEvent[\s\S]*if \(!terminalEventMarked\)[\s\S]*status: 500/,
  );
});

test("SePay expense matching handles unapplied migration schema errors", () => {
  assert.match(expenseOptionsLoader, /PGRST205/);
  assert.match(
    expenseOptionsLoader,
    /isExpenseMatchSchemaMissing\(matchErr\.code\)/,
  );
  assert.match(loader, /PGRST205/);
});

test("SePay expense loaders never return partial reconciliation evidence", () => {
  assert.match(
    expenseOptionsLoader,
    /if \(matchErr\) \{[\s\S]*?if \(isExpenseMatchSchemaMissing\(matchErr\.code\)\) \{[\s\S]*?break;[\s\S]*?throw new Error\("Unable to load bank transaction expense matches"\)/,
  );
  assert.match(
    expenseOptionsLoader,
    /if \(webhookErr\) \{[\s\S]*?throw new Error\("Unable to load webhook expense matches"\)/,
  );
});

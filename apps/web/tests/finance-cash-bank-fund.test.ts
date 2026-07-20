import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { calculateSepayBankBalance } from "../app/(protected)/finance/_lib/sepay-bank-transaction-model";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("bank balance counts each signed SePay movement once", () => {
  assert.equal(
    calculateSepayBankBalance(10_000_000, {
      inAmount: 2_000_000,
      outAmount: 1_000_000,
    }),
    11_000_000,
  );
});

test("finance landing shows current cash and bank balances", () => {
  const page = read("apps/web/app/(protected)/finance/page.tsx");
  const currentFunds = read(
    "apps/web/app/(protected)/finance/components/current-funds-section.tsx",
  );
  const copy = read("apps/web/lib/messages/finance.ts");

  assert.match(page, /fetchCashSummary\(\)/);
  assert.match(page, /CurrentFundsSection cash=\{cash\}/);
  assert.match(
    currentFunds,
    /cash\.hasOpening[\s\S]*formatVND\(cash\.cashOnHand\)/,
  );
  assert.match(
    currentFunds,
    /cash\.hasBankOpening[\s\S]*formatVND\(cash\.bankOnHand\)/,
  );
  assert.match(copy, /cashOnHand: "Tiền mặt theo sổ"/);
  assert.match(copy, /bankOnHand: "Tiền trong ngân hàng"/);
  assert.match(
    copy,
    /Sửa số đầu kỳ chỉ thay đổi mốc, không xóa giao dịch đã có/,
  );
  assert.match(currentFunds, /setCashOpening/);
});

// The bank fund follows the signed SePay account ledger; the cash fund follows
// actual cash collections and payouts.
test("bank fund pulls SePay in and out with the right sign", () => {
  const cockpit = read("apps/web/app/(protected)/finance/_lib/cash-cockpit.ts");
  const bankLoader = read(
    "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
  );
  const cashMigration = read(
    "supabase/migration-archive/20260714031027_20260713160248_persist_sepay_refund_match.sql",
  );
  const bankMigration = read(
    "supabase/migration-archive/20260719210000_create_canonical_bank_transactions.sql",
  );
  const financeAclMigration = read(
    "supabase/migration-archive/20260719213000_harden_finance_function_execute_acl.sql",
  );
  const periodMigration = read(
    "supabase/migration-archive/20260716100000_close_expense_payment_state_machine.sql",
  );
  const page = read("apps/web/app/(protected)/finance/page.tsx");

  assert.match(
    cockpit,
    /fetchSepayBankMovementSince\(supabase,\s*openingStart\)/,
    "bank movement must use the opening timestamp",
  );
  assert.match(
    cockpit,
    /\.rpc\("get_cash_ledger_movement_since",\s*\{\s*p_since:\s*startIso\s*\}\)/,
    "cash movement must use an aggregate RPC without PostgREST row truncation",
  );
  assert.match(
    cockpit,
    /cashMovement\.collections\s*\+\s*Math\.max\(cashMovement\.varianceAdjustments, 0\)/,
    "cash-in must include accepted POS overage adjustments",
  );
  assert.match(
    cockpit,
    /bankInSince\s*=\s*bankMovement\.inAmount/,
    "bank-in must use SePay incoming transfer amount",
  );
  assert.match(
    cockpit,
    /bankOutSince\s*=\s*bankMovement\.outAmount/,
    "bank-out must use SePay outgoing transfer amount",
  );
  assert.match(
    cockpit,
    /cashMovement\.expenses\s*\+\s*cashMovement\.supplierPayments\s*\+\s*cashMovement\.refunds\s*\+\s*Math\.max\(-cashMovement\.varianceAdjustments, 0\)/,
    "one aggregate must include cash payouts and accepted POS shortages",
  );
  assert.doesNotMatch(
    cockpit,
    /\.from\("payments"\)|\.from\("refunds"\)/,
    "cash movement must not sum a truncated PostgREST row set",
  );
  assert.doesNotMatch(
    cockpit,
    /unmatchedTransfer|supplierPaymentsSince\.bankTransfer/,
    "expense and AP records must not move the signed bank balance again",
  );
  assert.doesNotMatch(
    cockpit,
    /get_operating_cash_movement_for_period/,
    "the landing must not load a supporting period-cash metric it no longer renders",
  );
  assert.doesNotMatch(page, /cashNetMovementPeriod/);
  assert.doesNotMatch(page, /cockpit\.kpis\.totalCollected\s*-/);
  assert.match(
    cockpit,
    /bankOnHand:\s*calculateSepayBankBalance\(bankOpeningBalance,\s*bankMovement\)/,
    "bank on hand must use the tested signed-movement model",
  );
  assert.match(bankLoader, /get_bank_ledger_movement_since/);
  assert.doesNotMatch(
    bankLoader,
    /SEPAY_BALANCE_SCAN_LIMIT/,
    "running bank balance must not depend on a capped webhook list",
  );
  assert.match(
    cashMigration,
    /'cash_expenses',\s*v_cash_expenses[\s\S]*'cash_supplier_payments',\s*v_cash_supplier_payments/,
    "cash aggregate must cover expenses and supplier payments",
  );
  assert.match(
    bankMigration,
    /CREATE TABLE public\.bank_transactions[\s\S]*UNIQUE \(tenant_id, provider_transaction_id\)/,
    "database must own one canonical row per SePay transaction and tenant",
  );
  assert.match(
    bankMigration,
    /CREATE TRIGGER sync_sepay_bank_transaction_from_webhook[\s\S]*EXECUTE FUNCTION private\.sync_sepay_bank_transaction_from_webhook/,
    "signed SePay webhooks must enter the canonical ledger",
  );
  assert.match(
    bankMigration,
    /CREATE OR REPLACE FUNCTION public\.import_sepay_bank_transactions[\s\S]*bank_transaction_conflict[\s\S]*inserted_count[\s\S]*existing_count/,
    "SePay exports must import atomically and reject conflicting facts",
  );
  assert.match(
    bankMigration,
    /CREATE OR REPLACE FUNCTION public\.get_bank_ledger_movement_since[\s\S]*FROM public\.bank_transactions transaction[\s\S]*transaction\.occurred_at >= p_since/,
    "bank balance must aggregate the canonical ledger after the anchor",
  );
  assert.doesNotMatch(
    bankMigration.match(
      /CREATE OR REPLACE FUNCTION public\.get_bank_ledger_movement_since[\s\S]*?COMMENT ON FUNCTION public\.get_bank_ledger_movement_since/,
    )?.[0] ?? "",
    /webhook_events/,
    "matching or webhook delivery state must not move bank balance",
  );
  assert.match(
    financeAclMigration,
    /REVOKE ALL ON FUNCTION public\.import_sepay_bank_transactions\(jsonb\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role;[\s\S]*GRANT EXECUTE ON FUNCTION public\.import_sepay_bank_transactions\(jsonb\)[\s\S]*TO authenticated;/,
    "anonymous and service roles must not execute the owner-only SePay import RPC",
  );
  assert.match(
    financeAclMigration,
    /REVOKE ALL ON FUNCTION public\.resolve_pos_session_variance\(bigint, text, text\)[\s\S]*FROM PUBLIC, anon;[\s\S]*REVOKE ALL ON FUNCTION public\.get_inventory_value_period\(date, date, bigint\)[\s\S]*FROM PUBLIC, anon;/,
    "new Finance SECURITY DEFINER RPCs must explicitly revoke anonymous execution",
  );
  assert.match(
    periodMigration,
    /CREATE OR REPLACE FUNCTION public\.get_operating_cash_movement_for_period/,
  );
  assert.doesNotMatch(periodMigration, /get_cash_ledger_movement_for_period/);
  assert.match(
    periodMigration,
    /payment\.status IN \('completed', 'refunded'\)/,
    "period cash-in must retain the original collection after a refund",
  );
  assert.match(
    periodMigration,
    /refund\.status = 'approved'[\s\S]*refund\.payout_method = 'cash'/,
    "period cash-out must include approved cash refunds",
  );
  assert.match(
    periodMigration,
    /expense\.payment_method = 'cash'[\s\S]*expense\.paid_at >= v_start_at[\s\S]*expense\.paid_at < v_end_at[\s\S]*expense\.category IN \([\s\S]*'rent'[\s\S]*'utilities'[\s\S]*'gas_fuel'[\s\S]*'salary'[\s\S]*'supplies'[\s\S]*'repair'[\s\S]*'marketing'[\s\S]*'fees_tax'[\s\S]*'other'[\s\S]*supplier_payment\.payment_method = 'cash'/,
    "period cash-out must include only cash expenses and cash supplier payments",
  );
  assert.match(
    periodMigration,
    /CREATE OR REPLACE FUNCTION public\.get_cash_ledger_movement_since[\s\S]*expense\.paid_at >= p_since/,
    "running cash must recognize expense settlement by paid_at",
  );
  assert.doesNotMatch(
    periodMigration,
    /expense\.category IN \([\s\S]*'cogs_manual'[\s\S]*\)/,
    "manual materials cost must not be counted as operating cash out",
  );
  assert.doesNotMatch(
    periodMigration,
    /expense\.category IN \([\s\S]*'bank_deposit'[\s\S]*\)/,
    "cash-to-bank deposits must stay neutral in the operating cash signal",
  );
  assert.match(cockpit, /requireLedgerNumber/);
  assert.match(
    periodMigration,
    /p_branch_id IS NULL OR payment\.branch_id = p_branch_id[\s\S]*p_branch_id IS NULL OR refund\.branch_id = p_branch_id[\s\S]*p_branch_id IS NULL OR expense\.branch_id = p_branch_id[\s\S]*p_branch_id IS NULL OR grn\.branch_id = p_branch_id/,
    "every period cash source must follow the same optional branch scope",
  );
  assert.match(periodMigration, /NOT public\.auth_is_owner\(v_actor\)/);
  assert.match(
    periodMigration,
    /'net_cash_movement',\s*v_cash_collections - v_cash_out/,
  );
});

test("cash opening writes cash, bank, and date through one RPC", () => {
  const action = read("apps/web/app/(protected)/finance/cash-actions.ts");
  const migration = read(
    "supabase/migration-archive/20260629165000_finance_cash_opening_rpc.sql",
  );
  const databaseTypes = read("packages/database/src/types/database.types.ts");

  assert.match(
    action,
    /\.rpc\("set_finance_cash_opening",\s*\{/,
    "cash opening action must call the atomic RPC",
  );
  assert.doesNotMatch(
    action,
    /\.from\("system_settings"\)\s*[\s\S]*?\.upsert\(/,
    "cash opening action must not write the three settings independently",
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.set_finance_cash_opening/,
    "migration must define the atomic settings RPC",
  );
  assert.match(
    migration,
    /VALUES\s*\(\s*v_tenant_id,\s*'cash_opening_balance'[\s\S]*'bank_opening_balance'[\s\S]*'cash_opening_date'/,
    "RPC must persist all three opening anchors in one statement",
  );
  assert.match(
    databaseTypes,
    /set_finance_cash_opening:\s*\{\s*Args:\s*\{/,
    "generated type surface must include the RPC for app typecheck",
  );
});

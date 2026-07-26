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

test("finance landing presents immutable book funds", () => {
  const page = read("apps/web/app/(protected)/finance/page.tsx");
  const currentFunds = read(
    "apps/web/app/(protected)/finance/components/current-funds-section.tsx",
  );
  const copy = read("apps/web/lib/messages/finance.ts");

  assert.match(page, /fetchCashSummary\(\)/);
  assert.match(page, /CurrentFundsSection cash=\{cash\}/);
  assert.match(currentFunds, /cash\.hasOpening[\s\S]*cash\.cashOnHand/);
  assert.match(currentFunds, /cash\.hasOpening[\s\S]*cash\.bankOnHand/);
  assert.match(copy, /cashOnHand: "Tiền mặt theo sổ"/);
  assert.match(copy, /bankOnHand: "Tiền trong ngân hàng"/);
  assert.match(copy, /verifying: "Đang xác minh"/);
  assert.match(copy, /onHandTitle: "Số dư hiện có theo sổ"/);
  assert.match(currentFunds, /initializeFinanceFunds/);
  assert.match(currentFunds, /createFinanceFundAdjustment/);
  assert.match(currentFunds, /allowNegative/);
  assert.match(
    currentFunds,
    /disabled=\{!cash\.hasOpening && cash\.legacySettingsPresent\}/,
  );
  assert.match(currentFunds, /formatVNDateTime\(cash\.openingEffectiveAt\)/);
  assert.match(currentFunds, /openingConfirmation/);
  assert.match(currentFunds, /adjustmentConfirmation/);
  assert.doesNotMatch(currentFunds, /editOpening|setCashOpening/);
});

test("current funds load from one tenant-wide PostgreSQL snapshot", () => {
  const cockpit = read("apps/web/app/(protected)/finance/_lib/cash-cockpit.ts");
  const migration = read(
    "supabase/migrations/20260726140000_immutable_finance_fund_ledger.sql",
  );

  assert.match(cockpit, /\.rpc\("get_finance_current_funds"\)/);
  assert.doesNotMatch(cockpit, /\.from\("system_settings"\)/);
  assert.doesNotMatch(cockpit, /getVNDayUtcRange|openingDate/);
  assert.match(cockpit, /cash_collections/);
  assert.match(cockpit, /cash_refunds/);
  assert.match(cockpit, /cash_expenses/);
  assert.match(cockpit, /cash_supplier_payments/);
  assert.match(cockpit, /cash_variance_adjustments/);
  assert.match(cockpit, /cash_adjustments/);
  assert.match(cockpit, /bank_adjustments/);

  assert.match(
    migration,
    /public\.get_cash_ledger_movement_since\(v_opening\.effective_at\)/,
  );
  assert.match(
    migration,
    /public\.get_bank_ledger_movement_since\(v_opening\.effective_at\)/,
  );
  assert.match(
    migration,
    /entry\.entry_type = 'adjustment'[\s\S]*entry\.effective_at >= v_opening\.effective_at/,
  );
  assert.match(
    migration,
    /v_opening\.cash_delta[\s\S]*\+ v_cash_collections[\s\S]*- v_cash_refunds[\s\S]*- v_cash_expenses[\s\S]*- v_cash_supplier_payments[\s\S]*\+ v_cash_variance_adjustments[\s\S]*\+ v_cash_adjustments/,
  );
  assert.match(
    migration,
    /v_opening\.bank_delta[\s\S]*\+ v_bank_in[\s\S]*- v_bank_out[\s\S]*\+ v_bank_adjustments/,
  );
  assert.doesNotMatch(
    migration,
    /setting\.value[\s\S]*opening_(cash|bank)|cash_opening_balance'::numeric/,
  );
});

test("finance funds use one immutable append-only ledger contract", () => {
  const action = read("apps/web/app/(protected)/finance/cash-actions.ts");
  const migration = read(
    "supabase/migrations/20260726140000_immutable_finance_fund_ledger.sql",
  );
  const databaseTypes = read("packages/database/src/types/database.types.ts");
  const databaseTest = read("supabase/tests/finance_current_funds_test.sql");

  assert.match(
    action,
    /\.rpc\("initialize_finance_funds",\s*\{/,
    "opening action must call the one-time initialization RPC",
  );
  assert.match(
    action,
    /\.rpc\(\s*"create_finance_fund_adjustment",/,
    "corrections must append through the adjustment RPC",
  );
  assert.doesNotMatch(action, /\.from\("system_settings"\)/);
  assert.match(action, /boundaryMode === "project_start_day"/);
  assert.match(action, /: null\) as string,/);
  assert.match(
    migration,
    /CREATE TABLE public\.finance_fund_entries/,
    "migration must define the append-only ledger",
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX finance_fund_entries_one_opening_per_tenant/,
    "database must allow one opening per tenant",
  );
  assert.match(
    migration,
    /CREATE TRIGGER finance_fund_entries_reject_update_delete/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_finance_current_funds/,
    "one RPC snapshot must return the complete current funds result",
  );
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.set_finance_cash_opening/,
    "mutable opening RPC must be removed",
  );
  assert.match(
    migration,
    /cash_opening_balance[\s\S]*bank_opening_balance[\s\S]*cash_opening_date/,
    "prior setting keys must remain frozen as evidence",
  );
  assert.match(
    databaseTypes,
    /get_finance_current_funds:\s*\{\s*Args:/,
    "generated type surface must expose the summary RPC",
  );
  assert.match(databaseTest, /staff_repaid/);
  assert.match(databaseTest, /accepted_adjustment/);
  assert.match(databaseTest, /finance_fund_idempotency_conflict/);
  assert.match(databaseTest, /finance_server_cutover_retry_invalid/);
  assert.match(
    databaseTest,
    /finance_opening_non_finite_boundary_not_rejected/,
  );
  assert.match(databaseTest, /record_bank_transaction_cash_deposit/);
  assert.match(databaseTest, /cash_to_bank_transfer_changed_total_funds/);
});

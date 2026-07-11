import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

// The bank fund follows the signed SePay account ledger; the cash fund still
// follows POS cash and cash expenses only.
test("bank fund pulls SePay in and out with the right sign", () => {
  const cockpit = read("apps/web/app/(protected)/finance/_lib/cash-cockpit.ts");

  assert.match(
    cockpit,
    /fetchSepayBankMovementSince\(supabase,\s*tenantId,\s*openingDate\)/,
    "bank movement must come from signed SePay webhooks",
  );
  assert.match(
    cockpit,
    /cashInSince\s*=\s*toNumber\(\s*revData\?\.cash_revenue\s*\)/,
    "cash-in must still come from cash_revenue (not repointed)",
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
    /\.from\("supplier_payments"\)/,
    "cash summary must include supplier AP payments as paid cash out",
  );
  assert.match(
    cockpit,
    /getVNDayUtcRange\(resolved\.start\)\.startIso/,
    "supplier payments must be bucketed by Vietnam-local period range",
  );
  assert.match(
    cockpit,
    /cashOutSince\s*=\s*expensesSince\.cash\s*\+\s*supplierPaymentsSince\.cash/,
    "cash supplier payments must reduce running cash on hand",
  );
  assert.match(
    cockpit,
    /bankMovement\.outAmount\s*\+\s*expensesSince\.unmatchedTransfer\s*\+\s*supplierPaymentsSince\.bankTransfer/,
    "bank-transfer supplier payments must reduce running bank balance",
  );
  assert.match(
    cockpit,
    /cashOutPaidPeriod\s*=\s*expensesPaidPeriod\s*\+\s*supplierPaymentsPaidPeriod/,
    "period cash out must include paid expenses and paid supplier AP",
  );
  assert.match(
    cockpit,
    /bankOnHand:\s*bankOpeningBalance\s*\+\s*bankInSince\s*-\s*bankOutSince/,
    "bank on hand = opening + in - out",
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

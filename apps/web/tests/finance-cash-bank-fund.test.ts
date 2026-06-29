import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

// The bank fund mirrors the cash fund, so the main risk is wiring the wrong
// source into a balance: bank-in must be VietQR and bank-out must be transfer
// expenses.
test("bank fund pulls VietQR in and transfer out, with the right sign", () => {
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/cash-cockpit.ts",
  );

  assert.match(
    cockpit,
    /bankInSince\s*=\s*toNumber\(\s*revData\?\.vietqr_revenue\s*\)/,
    "bank-in must come from vietqr_revenue",
  );
  assert.match(
    cockpit,
    /cashInSince\s*=\s*toNumber\(\s*revData\?\.cash_revenue\s*\)/,
    "cash-in must still come from cash_revenue (not repointed)",
  );
  assert.match(
    cockpit,
    /===\s*"transfer"\)\s*transfer\s*\+=\s*amount/,
    "transfer expenses must accumulate into the transfer bucket",
  );
  assert.match(
    cockpit,
    /transfer:\s*bankOutSince/,
    "bank-out must read the transfer bucket",
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
    "supabase/migrations/20260629165000_finance_cash_opening_rpc.sql",
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

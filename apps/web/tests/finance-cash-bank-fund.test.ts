import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  calculateSepayBankBalance,
} from "../app/(protected)/finance/_lib/sepay-bank-transaction-model";
import { fetchSepayBankMovementSince } from "../app/(protected)/finance/_lib/sepay-bank-transactions";

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

test("bank movement paginates past the first thousand signed events", async () => {
  const rows = Array.from({ length: 1_505 }, (_, index) => ({
    id: index + 1,
    request_id: `sepay-${index + 1}`,
    created_at: "2026-07-13T01:00:00.000Z",
    processing_status: "processed",
    error_code: null,
    order_id: null,
    payment_id: null,
    expense_id: null,
    payload: {
      transactionDate: "2026-07-13 08:00:00",
      transferType: "in",
      transferAmount: 1,
    },
  }));
  const pageStarts: number[] = [];
  const supabase = {
    from: () => {
      let lastId = 0;
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        gte: () => query,
        gt: (_column: string, value: number) => {
          lastId = value;
          return query;
        },
        order: () => query,
        limit: async (limit: number) => {
          pageStarts.push(lastId);
          return {
            data: rows.filter((row) => row.id > lastId).slice(0, limit),
            error: null,
          };
        },
      };
      return query;
    },
  };

  assert.deepEqual(
    await fetchSepayBankMovementSince(
      supabase as never,
      1,
      "2026-07-13",
    ),
    { inAmount: 1_505, outAmount: 0 },
  );
  assert.deepEqual(pageStarts, [0, 1_000]);
});

// The bank fund follows the signed SePay account ledger; the cash fund still
// follows POS cash and cash expenses only.
test("bank fund pulls SePay in and out with the right sign", () => {
  const cockpit = read("apps/web/app/(protected)/finance/_lib/cash-cockpit.ts");
  const bankTransactions = read(
    "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
  );

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
    /cashOutSince\s*=\s*cashExpensesSince\s*\+\s*supplierPaymentsSince\.cash/,
    "cash supplier payments must reduce running cash on hand",
  );
  assert.doesNotMatch(
    cockpit,
    /unmatchedTransfer|supplierPaymentsSince\.bankTransfer/,
    "expense and AP records must not move the signed bank balance again",
  );
  assert.match(
    cockpit,
    /cashOutPaidPeriod\s*=\s*expensesPaidPeriod\s*\+\s*supplierPaymentsPaidPeriod/,
    "period cash out must include paid expenses and paid supplier AP",
  );
  assert.match(
    cockpit,
    /bankOnHand:\s*calculateSepayBankBalance\(bankOpeningBalance,\s*bankMovement\)/,
    "bank on hand must use the tested signed-movement model",
  );
  assert.match(bankTransactions, /fetchAllSepayWebhookRowsSince/);
  assert.match(bankTransactions, /\.gt\("id", lastId\)/);
  assert.match(bankTransactions, /page\.length < SEPAY_BALANCE_PAGE_SIZE/);
  assert.doesNotMatch(bankTransactions, /SEPAY_BALANCE_SCAN_LIMIT|5000 retained/);
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

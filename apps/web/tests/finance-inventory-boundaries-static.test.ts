import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Finance desync attention follows the selected local period and branch", () => {
  const source = read("app/(protected)/finance/_lib/finance-cockpit.ts");

  assert.match(
    source,
    /getVNDateRangeUtc\(startDate, endDate\)[\s\S]*?p_since: startIso/,
  );
  assert.match(source, /\.lt\("payment_paid_at", endIso\)/);
  assert.match(source, /query = query\.eq\("branch_id", branchId\)/);
});

test("Inventory fulfillment hub keeps manual transfer as a secondary route", () => {
  const list = read("app/(protected)/inventory/transfers/page.tsx");
  const create = read("app/(protected)/inventory/transfers/new/page.tsx");

  assert.match(list, /copy\.manualTransferAction/);
  assert.match(list, /variant="outline"/);
  assert.match(create, /<CreateTransferForm/);
});

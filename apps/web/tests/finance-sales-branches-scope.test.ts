import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  applySalesBranchesFilter,
} from "../app/(protected)/finance/_lib/finance-sales-branches";

const cockpit = readFileSync(
  new URL(
    "../app/(protected)/finance/_lib/finance-cockpit.ts",
    import.meta.url,
  ),
  "utf8",
);
const expenseActions = readFileSync(
  new URL("../app/(protected)/finance/expense-actions.ts", import.meta.url),
  "utf8",
);
const startupCapitalRpc = readFileSync(
  new URL(
    "../../../supabase/migration-archive/20260824013553_finance_startup_capital_summary_rpc.sql",
    import.meta.url,
  ),
  "utf8",
);

test("finance location=branches uses sales Chi nhánh ids, not IS NOT NULL", () => {
  // The cockpit delegates the startup-capital branches scope to the
  // get_finance_startup_capital_summary RPC, which filters
  // branch_kind = 'branch' server-side; expense-actions keeps the
  // client-side helpers for its own PostgREST queries.
  assert.match(cockpit, /get_finance_startup_capital_summary/);
  assert.doesNotMatch(
    cockpit,
    /location === "branches"[\s\S]{0,80}not\("branch_id", "is", null\)/,
  );
  // The RPC itself must keep the sales-branch invariant: the branches
  // scope aggregates only branch_kind = 'branch' ids via ANY().
  assert.match(startupCapitalRpc, /branch_kind = 'branch'/);
  assert.match(startupCapitalRpc, /WHEN 'branches' THEN expense\.branch_id = ANY/);
  assert.match(expenseActions, /fetchSalesBranchIds/);
});

test("applySalesBranchesFilter forces empty result when no sales branches", () => {
  const calls: unknown[] = [];
  const query = {
    in(column: string, values: readonly number[]) {
      calls.push(["in", column, values]);
      return query;
    },
    eq(column: string, value: number) {
      calls.push(["eq", column, value]);
      return query;
    },
  };
  applySalesBranchesFilter(query, "branch_id", []);
  assert.deepEqual(calls, [["eq", "branch_id", -1]]);
  calls.length = 0;
  applySalesBranchesFilter(query, "branch_id", [3, 5]);
  assert.deepEqual(calls, [["in", "branch_id", [3, 5]]]);
});

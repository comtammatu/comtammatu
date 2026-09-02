import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("D1 leftover cash is rebound and counted on the open till", () => {
  const sql = read(
    "supabase/migrations/20260818221238_pos_session_carry_forward_cash.sql",
  );
  const proof = read("supabase/tests/pos_session_carry_forward_cash_test.sql");
  const financeDoc = read("docs/modules/finance.md");

  assertSqlMatch(sql, /CREATE OR REPLACE FUNCTION public\.pos_session_cash_revenue/);
  assertSqlMatch(sql, /payment\.paid_at >= session\.opened_at/);
  assertSqlMatch(sql,
    /CREATE FUNCTION private\.rebind_paid_order_to_open_pos_session|CREATE OR REPLACE FUNCTION private\.rebind_paid_order_to_open_pos_session/,
  );
  assertSqlMatch(sql,
    /trg_payments_rebind_paid_order_to_open_pos_session/,
  );
  assertSqlMatch(sql, /v_cash_revenue := public\.pos_session_cash_revenue/);
  assertSqlMatch(sql,
    /AND payment\.paid_at >= open_session\.opened_at/,
  );
  assert.match(proof, /paid leftover order must rebind to the open session/);
  assert.match(proof, /open till must include leftover cash/);
  assert.match(
    financeDoc,
    /Paying a carry-forward unpaid order\s+rebinds `pos_session_id`/,
  );
});

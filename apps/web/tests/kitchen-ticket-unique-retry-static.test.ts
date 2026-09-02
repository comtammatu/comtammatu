import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("kitchen send batch unique collisions retry with daily ticket_seq", () => {
  const sql = read(
    "supabase/migrations/20260818221613_kitchen_send_batch_ticket_unique_retry.sql",
  );
  const proof = read("supabase/tests/kds_completion_print_contract_test.sql");

  assertSqlMatch(sql, /route_order_to_kds/);
  assertSqlMatch(sql, /unique_violation/);
  assertSqlMatch(sql, /kitchen_send_batches_branch_date_ticket_number_unique/);
  assertSqlMatch(sql,
    /v_ticket_number := '#' \|\| v_ticket_base \|\| '-' \|\| v_ticket_seq::text/,
  );
  assert.match(proof, /retry kitchen ticket unique collisions/);
  assert.match(proof, /unique_violation/);
});

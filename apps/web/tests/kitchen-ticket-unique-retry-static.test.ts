import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("kitchen send batch unique collisions retry with daily ticket_seq", () => {
  const sql = read(
    "supabase/migration-archive/20260818221613_kitchen_send_batch_ticket_unique_retry.sql",
  );
  const proof = read("supabase/tests/kds_completion_print_contract_test.sql");

  assert.match(sql, /route_order_to_kds/);
  assert.match(sql, /unique_violation/);
  assert.match(sql, /kitchen_send_batches_branch_date_ticket_number_unique/);
  assert.match(
    sql,
    /v_ticket_number := '#' \|\| v_ticket_base \|\| '-' \|\| v_ticket_seq::text/,
  );
  assert.match(proof, /retry kitchen ticket unique collisions/);
  assert.match(proof, /unique_violation/);
});

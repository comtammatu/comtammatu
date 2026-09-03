import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  new URL("../../../supabase/tests/grab_relay_order_revision.sql", import.meta.url),
  "utf8",
);

test("Grab relay revision SQL is service_role only and locks the order", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.relay_cancel_delivery_order/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.relay_apply_grab_order_revision/);
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(sql, /PERFORM pg_advisory_xact_lock\(p_order_id\)/);
  assert.match(sql, /paid_or_terminal/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.relay_cancel_delivery_order/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.relay_apply_grab_order_revision/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.relay_cancel_delivery_order[\s\S]*authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.relay_apply_grab_order_revision[\s\S]*authenticated/);
  assert.match(sql, /idempotent/);
});

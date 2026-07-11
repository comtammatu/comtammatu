import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const readWeb = (path: string) => readFileSync(join(root, path), "utf8");
const migration = readFileSync(
  join(
    root,
    "../..",
    "supabase/migrations/20260711140000_retire_self_order_v2.sql",
  ),
  "utf8",
);

test("Self-Order V2 retirement fails closed and preserves the request model", () => {
  for (const table of [
    "self_order_sessions",
    "self_order_batches",
    "self_order_session_devices",
  ]) {
    assert.match(
      migration,
      new RegExp(`self_order_v2_.*not_empty[\\s\\S]*${table}|${table}[\\s\\S]*self_order_v2_.*not_empty`),
    );
    assert.match(migration, new RegExp(`DROP TABLE IF EXISTS public\\.${table}`));
  }

  assert.match(
    migration,
    /ALTER TABLE public\.self_order_payment_requests DROP COLUMN IF EXISTS session_id/,
  );
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.self_order_broadcast_session_changed\(\)/,
  );
  assert.match(
    migration,
    /DROP POLICY IF EXISTS self_order_public_broadcast_select ON realtime\.messages/,
  );
  assert.doesNotMatch(migration, /CASCADE/);

  const server = readWeb("lib/self-order/server.ts");
  const staffActions = readWeb(
    "app/(protected)/br/[branchId]/pos/self-order-actions.ts",
  );
  assert.match(server, /self_order_get_snapshot/);
  assert.match(server, /self_order_submit/);
  assert.match(server, /self_order_create_payment_request/);
  assert.match(staffActions, /self_order_accept_request/);
  assert.match(staffActions, /self_order_reject_request/);
  assert.match(staffActions, /self_order_cancel_payment_request/);
  assert.doesNotMatch(`${server}\n${staffActions}`, /self_order_.*_v2|session_devices|capabilityVersion|pairingCode/);
});

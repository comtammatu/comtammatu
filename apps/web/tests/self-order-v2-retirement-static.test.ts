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
  assert.match(
    migration,
    /DROP TRIGGER IF EXISTS trg_self_order_payment_requests_broadcast ON public\.self_order_payment_requests/,
  );
  assert.match(
    migration,
    /DROP TRIGGER IF EXISTS trg_self_order_close_session_from_order ON public\.orders/,
  );
  assert.ok(
    migration.indexOf("DROP TABLE IF EXISTS public.self_order_batches") <
      migration.indexOf(
        "DROP FUNCTION IF EXISTS public.self_order_broadcast_session_changed()",
      ),
  );
  assert.ok(
    migration.indexOf("DROP TABLE IF EXISTS public.self_order_sessions") <
      migration.indexOf(
        "DROP FUNCTION IF EXISTS public.self_order_broadcast_session_changed()",
      ),
  );
  for (const signature of [
    "private.self_order_get_snapshot_base(text)",
    "private.self_order_list_staff_queue_base(bigint)",
    "public.self_order_append_active_batch(bigint, bigint, uuid, jsonb)",
    "public.self_order_approve_batch(bigint, bigint, bigint, uuid)",
    "public.self_order_list_staff_queue(bigint)",
    "public.self_order_reject_batch(bigint, text)",
    "public.self_order_submit_batch(text, uuid, jsonb, text)",
  ]) {
    assert.ok(migration.includes(`DROP FUNCTION IF EXISTS ${signature}`));
  }
  const paymentInvariant =
    migration.match(
      /CREATE OR REPLACE FUNCTION public\.self_order_enforce_payment_request_invariants\(\)[\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
  assert.notEqual(paymentInvariant, "");
  assert.doesNotMatch(paymentInvariant, /session_id/);
  const paymentInvariantTrigger =
    migration.slice(
      migration.indexOf(
        "CREATE TRIGGER trg_self_order_enforce_payment_request_invariants",
      ),
      migration.indexOf(
        "REVOKE ALL ON FUNCTION public.self_order_enforce_payment_request_invariants()",
      ),
    ) ?? "";
  assert.notEqual(paymentInvariantTrigger, "");
  assert.doesNotMatch(paymentInvariantTrigger, /session_id/);
  assert.ok(
    migration.indexOf(
      "DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_request_invariants ON public.self_order_payment_requests",
    ) <
      migration.indexOf(
        "ALTER TABLE public.self_order_payment_requests DROP COLUMN IF EXISTS session_id",
      ),
  );
  assert.doesNotMatch(
    migration,
    /DROP FUNCTION IF EXISTS public\.self_order_enforce_open_pos_session\(\)/,
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

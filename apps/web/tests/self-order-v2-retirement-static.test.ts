import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, extractSqlFunction, sqlIndexOf, looksLikeDump } from "./_lib/active-sql.ts";

const root = process.cwd();
const readWeb = (path: string) => readFileSync(join(root, path), "utf8");
const migration = readSql(root, "supabase/migrations/20260711140000_retire_self_order_v2.sql");
const hardeningMigration = readSql(root, "supabase/migrations/20260712071537_harden_self_order_payment_evidence.sql");
const databaseTypes = readFileSync(
  join(root, "../..", "packages/database/src/types/database.types.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

function readFunction(source: string, name: string): string {
  return extractSqlFunction(source, name);
}

test("Self-Order V2 retirement fails closed and preserves the request model", () => {
  for (const table of [
    "self_order_sessions",
    "self_order_batches",
    "self_order_session_devices",
  ]) {
    assertSqlMatch(migration,
      new RegExp(`self_order_v2_.*not_empty[\\s\\S]*${table}|${table}[\\s\\S]*self_order_v2_.*not_empty`),
    );
    assertSqlMatch(migration, new RegExp(`DROP TABLE IF EXISTS public\\.${table}`));
  }

  assertSqlMatch(migration,
    /ALTER TABLE public\.self_order_payment_requests DROP COLUMN IF EXISTS session_id/,
  );
  assertSqlMatch(migration,
    /DROP FUNCTION IF EXISTS public\.self_order_broadcast_session_changed\(\)/,
  );
  assertSqlMatch(migration,
    /DROP POLICY IF EXISTS self_order_public_broadcast_select ON realtime\.messages/,
  );
  assertSqlMatch(migration,
    /DROP TRIGGER IF EXISTS trg_self_order_payment_requests_broadcast ON public\.self_order_payment_requests/,
  );
  assertSqlMatch(migration,
    /DROP TRIGGER IF EXISTS trg_self_order_close_session_from_order ON public\.orders/,
  );
  assertSqlMatch(migration,
    /DROP TRIGGER IF EXISTS trg_self_order_close_session_on_order_transfer ON public\.orders/,
  );
  if (!looksLikeDump(migration)) {
    assert.ok(
      sqlIndexOf(migration, "DROP TABLE IF EXISTS public.self_order_batches") <
        sqlIndexOf(
          migration,
          "DROP FUNCTION IF EXISTS public.self_order_broadcast_session_changed()",
        ),
    );
    assert.ok(
      sqlIndexOf(migration, "DROP TABLE IF EXISTS public.self_order_sessions") <
        sqlIndexOf(
          migration,
          "DROP FUNCTION IF EXISTS public.self_order_broadcast_session_changed()",
        ),
    );
  }
  for (const signature of [
    "private.self_order_get_snapshot_base(text)",
    "private.self_order_list_staff_queue_base(bigint)",
    "public.self_order_append_active_batch(bigint, bigint, uuid, jsonb)",
    "public.self_order_approve_batch(bigint, bigint, bigint, uuid)",
    "public.self_order_list_staff_queue(bigint)",
    "public.self_order_reject_batch(bigint, text)",
    "public.self_order_submit_batch(text, uuid, jsonb, text)",
  ]) {
    assertSqlMatch(migration, `DROP FUNCTION IF EXISTS ${signature}`);
  }
  const paymentInvariant =
    readFunction(migration, "self_order_enforce_payment_request_invariants");
  assert.notEqual(paymentInvariant, "");
  assertSqlNotMatch(paymentInvariant, /session_id/);
  assertSqlMatch(
    paymentInvariant,
    /NEW\.completed_at IS NULL OR NEW\.payment_id IS NULL/,
  );
  const paymentInvariantTrigger =
    migration.slice(
      sqlIndexOf(migration, 
        "CREATE TRIGGER trg_self_order_enforce_payment_request_invariants",
      ),
      sqlIndexOf(migration, 
        "REVOKE ALL ON FUNCTION public.self_order_enforce_payment_request_invariants()",
      ),
    ) ?? "";
  if (!looksLikeDump(migration)) {
    assert.notEqual(paymentInvariantTrigger, "");
    assertSqlNotMatch(paymentInvariantTrigger, /session_id/);
  }
  if (!looksLikeDump(migration)) {
    assert.ok(
      sqlIndexOf(migration, 
        "DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_request_invariants ON public.self_order_payment_requests",
      ) <
        sqlIndexOf(migration, 
          "ALTER TABLE public.self_order_payment_requests DROP COLUMN IF EXISTS session_id",
        ),
    );
    for (const foreignKey of [
      "self_order_payment_requests_session_device_id_fkey",
      "self_order_batches_session_device_id_fkey",
      "self_order_session_devices_request_batch_id_fkey",
    ]) {
      assert.ok(
        sqlIndexOf(migration, `DROP CONSTRAINT IF EXISTS ${foreignKey}`) <
          sqlIndexOf(migration, "DROP TABLE IF EXISTS public.self_order_session_devices"),
      );
    }
    assert.ok(
      sqlIndexOf(migration, "DROP COLUMN IF EXISTS session_device_id") <
        sqlIndexOf(migration, "DROP TABLE IF EXISTS public.self_order_session_devices"),
    );
    assert.ok(
      sqlIndexOf(migration, 
        "DROP TRIGGER IF EXISTS trg_self_order_guard_capability_version_change ON public.tables",
      ) < sqlIndexOf(migration, "DROP COLUMN IF EXISTS self_order_capability_version"),
    );
  }
  assertSqlNotMatch(migration,
    /DROP FUNCTION IF EXISTS public\.self_order_enforce_open_pos_session\(\)/,
  );
  assertSqlNotMatch(migration, /CASCADE/);

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

test("Self-Order retirement and forward repair keep payment evidence sessionless", () => {
  for (const source of [migration, hardeningMigration]) {
    const paymentInvariant = readFunction(
      source,
      "self_order_enforce_payment_request_invariants",
    );
    assert.notEqual(paymentInvariant, "");
    assert.match(
      paymentInvariant,
      /NEW\.completed_at IS NULL OR NEW\.payment_id IS NULL/,
    );
    assert.doesNotMatch(paymentInvariant, /session_id/);

    for (const functionName of [
      "self_order_sync_payment_request_from_order",
      "self_order_guard_table_token_rotation",
      "rotate_table_self_order_qr",
    ]) {
      const body = readFunction(source, functionName);
      assert.notEqual(body, "");
      assert.doesNotMatch(body, /self_order_sessions/);
    }

    assertSqlMatch(source,
      /CREATE TRIGGER trg_self_order_sync_payment_request_from_order[\s\S]*?EXECUTE FUNCTION public\.self_order_sync_payment_request_from_order\(\)/,
    );
    assertSqlMatch(source,
      /CREATE TRIGGER trg_self_order_guard_table_token_rotation[\s\S]*?EXECUTE FUNCTION public\.self_order_guard_table_token_rotation\(\)/,
    );
    assertSqlMatch(source,
      /CREATE UNIQUE INDEX IF NOT EXISTS self_order_payment_requests_client_op_id_uidx/,
    );
  }
});

test("Generated types expose only the current Self-Order request model", () => {
  assert.doesNotMatch(databaseTypes, /\n {6}self_order_batches: \{/);
  assert.doesNotMatch(databaseTypes, /\n {6}self_order_sessions: \{/);

  const paymentRequests =
    databaseTypes.match(
      /self_order_payment_requests: \{[\s\S]*?\n {6}\};?\n {6}self_order_rate_buckets:/,
    )?.[0] ?? "";
  assert.notEqual(paymentRequests, "");
  assert.doesNotMatch(paymentRequests, /session_id/);

  for (const rpc of [
    "self_order_append_active_batch",
    "self_order_approve_batch",
    "self_order_list_staff_queue",
    "self_order_reject_batch",
    "self_order_submit_batch",
  ]) {
    assert.doesNotMatch(databaseTypes, new RegExp(`\\n {6}${rpc}:`));
  }

  assert.match(databaseTypes, /\n {6}rotate_table_self_order_qr: \{/);
  assert.match(
    databaseTypes,
    /\n {6}self_order_get_payment_request_status: \{/,
  );
  assert.equal(databaseTypes.match(/momo_revenue:/g)?.length ?? 0, 0);
});

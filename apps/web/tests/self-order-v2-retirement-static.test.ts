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
const paymentEvidenceMigration = readFileSync(
  join(
    root,
    "../..",
    "supabase/migrations/20260712071537_harden_self_order_payment_evidence.sql",
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
    assert.match(
      migration,
      new RegExp(`EXECUTE 'SELECT EXISTS \\(SELECT 1 FROM public\\.${table}\\)'`),
    );
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
  assert.match(
    migration,
    /DROP TRIGGER IF EXISTS trg_self_order_close_session_on_order_transfer ON public\.orders/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_sync_payment_request_from_order\(\)[\s\S]*UPDATE public\.self_order_payment_requests/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER trg_self_order_sync_payment_request_from_order[\s\S]*AFTER UPDATE OF status, payment_status ON public\.orders/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER trg_self_order_sync_payment_request_from_order[\s\S]*WHEN \([\s\S]*OLD\.status IS DISTINCT FROM NEW\.status[\s\S]*OLD\.payment_status IS DISTINCT FROM NEW\.payment_status/,
  );
  for (const source of [migration, paymentEvidenceMigration]) {
    assert.match(
      source,
      /NEW\.status = 'completed'[\s\S]*NEW\.completed_at IS NULL OR NEW\.payment_id IS NULL[\s\S]*self_order_completed_request_missing_payment_evidence/,
    );
    assert.match(
      source,
      /IF v_payment_id IS NULL THEN[\s\S]*RETURN NULL;[\s\S]*UPDATE public\.self_order_payment_requests/,
    );
    assert.match(
      source,
      /SELECT p\.id, p\.method, p\.paid_at[\s\S]*p\.branch_id = NEW\.branch_id/,
    );
    assert.match(
      source,
      /pr\.method = 'cash_call' AND v_payment_method = 'cash'[\s\S]*pr\.method = 'vietqr' AND v_payment_method = 'vietqr'/,
    );
    assert.match(source, /order_paid_by_other_method/);
    assert.match(
      source,
      /CREATE TRIGGER trg_self_order_sync_payment_request_from_order[\s\S]*AFTER UPDATE OF status, payment_status ON public\.orders/,
    );
    assert.match(
      source,
      /CREATE TRIGGER trg_self_order_guard_table_token_rotation[\s\S]*BEFORE UPDATE OF self_order_token, self_order_token_rotated_at ON public\.tables/,
    );
    assert.match(
      source,
      /self_order_payment_requests_client_op_id_uidx[\s\S]*\(tenant_id, client_op_id\)/,
    );
  }
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
    "public.self_order_batch_request_fingerprint(jsonb, text)",
    "public.self_order_fill_batch_request_fingerprint()",
    "public.self_order_enforce_session_invariants()",
    "public.self_order_enforce_batch_transition()",
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
  assert.ok(
    migration.indexOf(
      "CREATE UNIQUE INDEX IF NOT EXISTS self_order_payment_requests_client_op_id_uidx",
    ) <
      migration.indexOf(
        "ALTER TABLE public.self_order_payment_requests DROP COLUMN IF EXISTS session_id",
      ),
  );
  assert.match(
    migration,
    /self_order_payment_requests_client_op_id_uidx[\s\S]*\(tenant_id, client_op_id\)/,
  );
  for (const foreignKey of [
    "self_order_payment_requests_session_device_id_fkey",
    "self_order_batches_session_device_id_fkey",
    "self_order_session_devices_request_batch_id_fkey",
  ]) {
    assert.ok(
      migration.indexOf(`DROP CONSTRAINT IF EXISTS ${foreignKey}`) <
        migration.indexOf("DROP TABLE IF EXISTS public.self_order_session_devices"),
    );
  }
  assert.ok(
    migration.indexOf("DROP COLUMN IF EXISTS session_device_id") <
      migration.indexOf("DROP TABLE IF EXISTS public.self_order_session_devices"),
  );
  assert.ok(
    migration.indexOf(
      "DROP TRIGGER IF EXISTS trg_self_order_guard_capability_version_change ON public.tables",
    ) < migration.indexOf("DROP COLUMN IF EXISTS self_order_capability_version"),
  );
  assert.doesNotMatch(
    migration,
    /DROP FUNCTION IF EXISTS public\.self_order_enforce_open_pos_session\(\)/,
  );
  assert.doesNotMatch(
    migration,
    /DROP FUNCTION IF EXISTS public\.self_order_sync_payment_request\(\)/,
  );
  for (const functionName of [
    "self_order_guard_table_token_rotation",
    "rotate_table_self_order_qr",
  ]) {
    const body =
      migration.match(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
        ),
      )?.[0] ?? "";
    assert.notEqual(body, "", `${functionName} must be rewritten before table removal`);
    assert.doesNotMatch(body, /self_order_sessions/);
  }
  assert.match(
    migration,
    /CREATE TRIGGER trg_self_order_guard_table_token_rotation[\s\S]*BEFORE UPDATE OF self_order_token, self_order_token_rotated_at ON public\.tables/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.rotate_table_self_order_qr\(bigint\)[\s\S]*TO authenticated, service_role/,
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

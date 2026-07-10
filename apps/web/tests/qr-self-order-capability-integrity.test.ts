import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { publicSelfOrderSnapshotSchema } from "../lib/self-order/contracts";

const migration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/20260710032028_self_order_seating_capability.sql",
  ),
  "utf8",
);

function functionBody(name: string, nextName: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = migration.indexOf(
    `CREATE OR REPLACE FUNCTION public.${nextName}`,
    start + 1,
  );
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return migration.slice(start, end);
}

const snapshotV2 = functionBody(
  "self_order_get_snapshot_v2",
  "self_order_submit_batch_v2",
);
const legacySubmit = functionBody(
  "self_order_submit_batch",
  "self_order_create_payment_request",
);
const submitV2 = functionBody(
  "self_order_submit_batch_v2",
  "self_order_request_device_join_v2",
);
const paymentV2 = functionBody(
  "self_order_create_payment_request_v2",
  "self_order_approve_batch_v2",
);
const approveBatchV2 = functionBody(
  "self_order_approve_batch_v2",
  "self_order_approve_device_join_v2",
);
const approveDeviceV2 = functionBody(
  "self_order_approve_device_join_v2",
  "self_order_reject_batch_v2",
);
const rejectBatchV2 = functionBody(
  "self_order_reject_batch_v2",
  "self_order_reject_device_join_v2",
);
const broadcast = migration.slice(
  migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.self_order_broadcast_session_changed",
  ),
  migration.indexOf("DROP TRIGGER IF EXISTS trg_self_order_sessions_broadcast"),
);

test("v2 rollout is additive, table-scoped, and defaults every table to version 1", () => {
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS self_order_capability_version smallint NOT NULL DEFAULT 1/,
  );
  assert.match(
    migration,
    /CHECK \(self_order_capability_version IN \(1, 2\)\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.set_table_self_order_capability_version/,
  );
  assert.match(
    migration,
    /s\.status IN \('pending_approval', 'active'\)[\s\S]*self_order_open_session_exists/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER trg_self_order_guard_capability_version_change/,
  );
  assert.match(migration, /self_order_capability_version_rpc_required/);
  assert.match(
    migration,
    /self_order_guard_capability_version_change[\s\S]*pg_try_advisory_xact_lock/,
  );
  assert.match(migration, /set_config\(\s*'app\.self_order_capability_flip'/);
});

test("version 1 token-only mutation RPCs fail closed only after a table is on v2", () => {
  assert.match(
    migration,
    /IF FOUND AND v_version = 2 THEN[\s\S]*self_order_capability_required/,
  );
  assert.match(migration, /RETURN private\.self_order_submit_batch_v1_base/);
  assert.match(
    migration,
    /RETURN private\.self_order_create_payment_request_v1_base/,
  );
  assert.match(
    migration,
    /IF FOUND AND v_version = 2 THEN[\s\S]*RETURN public\.self_order_get_public_context_v2/,
  );

  const initialTableLookup = legacySubmit.indexOf("SELECT t.id");
  const tableLock = legacySubmit.indexOf("pg_advisory_xact_lock(");
  const capabilityRecheck = legacySubmit.indexOf(
    "SELECT t.self_order_capability_version",
  );
  const legacyMutation = legacySubmit.indexOf(
    "private.self_order_submit_batch_v1_base",
  );
  assert.ok(initialTableLookup >= 0);
  assert.ok(tableLock > initialTableLookup);
  assert.ok(capabilityRecheck > tableLock);
  assert.ok(legacyMutation > capabilityRecheck);
  assert.match(legacySubmit, /WHERE t\.id = v_table_id/);
});

test("device capabilities are hashed, monotonic, RLS protected, and not directly readable by staff", () => {
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.self_order_session_devices/,
  );
  assert.match(migration, /device_token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(
    migration,
    /status IN \([\s\S]*'origin_pending'[\s\S]*'join_pending'[\s\S]*'approved'[\s\S]*'revoked'/,
  );
  assert.match(migration, /self_order_device_identity_immutable/);
  assert.match(migration, /self_order_device_batch_scope_mismatch/);
  assert.match(migration, /self_order_invalid_device_transition/);
  assert.match(
    migration,
    /pairing_code_hash IS NOT NULL[\s\S]*pairing_code_salt IS NOT NULL/,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.self_order_session_devices ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.self_order_session_devices[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT SELECT ON TABLE public\.self_order_session_devices TO authenticated/,
  );
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS realtime_topic_token text\s+DEFAULT public\.self_order_random_token\(24\)/,
  );
  assert.doesNotMatch(migration, /WHERE realtime_topic_token IS NULL/);
});

test("batch and payment capability bindings are immutable and scope checked", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS session_device_id bigint/g);
  assert.match(migration, /self_order_batch_device_binding_immutable/);
  assert.match(migration, /self_order_batch_device_scope_mismatch/);
  assert.match(migration, /self_order_payment_device_binding_immutable/);
  assert.match(migration, /self_order_payment_device_scope_mismatch/);
  assert.match(migration, /self_order_batches_one_pending_per_device/);
});

test("pending snapshot remains public-safe while approved snapshot gets the seating topic", () => {
  const pendingBranch = snapshotV2.slice(
    snapshotV2.indexOf(
      "IF v_device.status IN ('origin_pending', 'join_pending')",
    ),
    snapshotV2.indexOf("IF v_device.status <> 'approved'"),
  );
  assert.match(pendingBranch, /'pendingBatch'/);
  assert.match(pendingBranch, /'deviceRequest'/);
  assert.doesNotMatch(pendingBranch, /self_order_get_snapshot_v1_base/);
  assert.doesNotMatch(pendingBranch, /realtimeTopic/);
  assert.match(snapshotV2, /v_device\.status <> 'approved'/);
  assert.match(
    snapshotV2,
    /v_device\.status IN \('rejected', 'revoked', 'expired'\)[\s\S]*'deviceAccess', v_device\.status/,
  );
  assert.match(
    snapshotV2,
    /v_terminal_device_status IN \('rejected', 'revoked', 'expired'\)[\s\S]*'deviceAccess', v_terminal_device_status/,
  );
  assert.match(snapshotV2, /FOR SHARE/);
  assert.match(snapshotV2, /private\.self_order_get_snapshot_v1_base/);
  assert.match(
    snapshotV2,
    /'self-order:seat:' \|\| v_session\.realtime_topic_token/,
  );
  assert.match(pendingBranch, /'menuItemId'/);
  assert.match(pendingBranch, /'itemName'/);
  assert.match(pendingBranch, /'unitPrice'/);
  assert.doesNotMatch(pendingBranch, /'key'/);
});

test("camelCase pending batch fixture satisfies the public snapshot contract", () => {
  const parsed = publicSelfOrderSnapshotSchema.safeParse({
    ok: true,
    capabilityVersion: 2,
    access: "origin_pending",
    seatingAccess: "join_required",
    deviceRequest: {
      deviceId: 11,
      kind: "origin",
      status: "origin_pending",
      pairingExpiresAt: "2026-07-10T05:05:00.000Z",
      expiresAt: "2026-07-10T05:15:00.000Z",
    },
    pendingBatch: {
      id: 21,
      status: "pending_approval",
      items: [
        {
          menuItemId: 31,
          itemName: "Cơm tấm sườn",
          variantId: null,
          variantName: null,
          quantity: 1,
          unitPrice: 65_000,
          modifiers: [],
          sides: [],
          note: null,
        },
      ],
      customerNote: null,
      createdAt: "2026-07-10T05:00:00.000Z",
    },
    branch: { name: "Chi nhánh thử nghiệm" },
    table: { number: 4 },
    session: null,
    order: null,
    batches: [],
    paymentRequest: null,
    menu: [],
  });

  assert.equal(parsed.success, true);
});

test("submit recovers exact device-bound intent before session gates and never auto-accepts a second device", () => {
  const exactRecovery = submitV2.slice(
    submitV2.indexOf("IF FOUND THEN"),
    submitV2.indexOf("IF EXISTS (", submitV2.indexOf("IF FOUND THEN")),
  );
  assert.ok(
    submitV2.indexOf("b.client_op_id = p_client_op_id") <
      submitV2.indexOf(`SELECT s.*
  INTO v_session_ref`),
  );
  assert.match(submitV2, /d\.device_token_hash = p_device_hash/);
  assert.match(submitV2, /v_device_found boolean := false/);
  assert.match(
    submitV2,
    /IF v_device_found AND v_device\.expires_at <= now\(\) THEN/,
  );
  assert.match(
    submitV2,
    /IF v_device_found[\s\S]*v_device\.status = 'approved'[\s\S]*self_order_append_active_batch/,
  );
  assert.match(
    submitV2,
    /self_order_create_pending_device\([\s\S]*'join'[\s\S]*'access', 'join_pending'/,
  );
  assert.match(submitV2, /self_order_trusted_ip_required/);
  assert.match(
    submitV2,
    /v_prior_device_status IN \('rejected', 'revoked'\)[\s\S]*self_order_device_%/,
  );
  assert.match(exactRecovery, /'pairingRefreshRequired'/);
  assert.doesNotMatch(
    exactRecovery,
    /self_order_consume_rate_limits|self_order_refresh_pairing_code\(/,
  );
});

test("rate buckets are atomic and permit missing IP only for an existing approved capability", () => {
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.self_order_rate_buckets/,
  );
  assert.match(
    migration,
    /ON CONFLICT \(purpose, scope_type, scope_hash, window_start\)[\s\S]*DO UPDATE SET hits = self_order_rate_buckets\.hits \+ 1/,
  );
  assert.match(migration, /IF p_ip_hash IS NOT NULL THEN[\s\S]*'ip'/);
  assert.match(
    migration,
    /v_ip_scope_hash := CASE[\s\S]*self_order_scope_hash\(v_token_hash \|\| ':' \|\| p_ip_hash\)/,
  );
  assert.match(
    migration,
    /p_tenant_id::text \|\| ':' \|\| p_table_id::text \|\| ':' \|\| p_token/,
  );
  assert.match(migration, /'retryAfterSeconds', v_retry_after_seconds/);
  assert.match(
    migration,
    /DELETE FROM public\.self_order_rate_buckets[\s\S]*LIMIT 100/,
  );
  assert.match(
    submitV2,
    /v_device\.status = 'approved'[\s\S]*self_order_consume_rate_limits\([\s\S]*'batch'/,
  );
});

test("stale device rows do not exhaust live limits or strand pending seating", () => {
  const createDevice = functionBody(
    "self_order_create_pending_device",
    "self_order_refresh_pairing_code",
  );
  assert.match(
    createDevice,
    /status IN \('origin_pending', 'join_pending', 'approved'\)\s+AND expires_at <= now\(\)/,
  );
  assert.match(
    createDevice,
    /d\.status IN \('origin_pending', 'join_pending', 'approved'\)\s+AND d\.expires_at > now\(\)/,
  );
  assert.match(submitV2, /failure_reason = 'origin_device_expired'/);
  assert.match(submitV2, /'code', 'self_order_session_expired'/);
});

test("pairing refresh is device-scoped, IP-gated, rotated, and three-attempt fail closed", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_refresh_pairing_code_v2\(\s*p_token text,\s*p_device_hash text,\s*p_ip_hash text/,
  );
  assert.match(
    migration,
    /self_order_refresh_pairing_code_v2[\s\S]*d\.device_token_hash = p_device_hash/,
  );
  assert.match(
    migration,
    /self_order_refresh_pairing_code_v2[\s\S]*self_order_trusted_ip_required/,
  );
  const refreshHelper = functionBody(
    "self_order_refresh_pairing_code",
    "self_order_guard_capability_version_change",
  );
  assert.match(refreshHelper, /v_device\.expires_at <= now\(\)/);
  assert.doesNotMatch(refreshHelper, /SET[\s\S]*expires_at = GREATEST/);
  assert.match(approveBatchV2, /pairing_attempts \+ 1/);
  assert.match(approveBatchV2, /pairing_attempts_exhausted/);
  assert.match(approveBatchV2, /attemptsRemaining/);
  assert.match(approveBatchV2, /v_code_valid IS DISTINCT FROM true/);
  assert.match(
    approveBatchV2,
    /IF v_device\.pairing_code_expires_at <= now\(\) THEN\s+RETURN jsonb_build_object\([\s\S]*'refreshRequired', true/,
  );
  assert.doesNotMatch(
    approveBatchV2,
    /pairing_code_expires_at <= now\(\)\s+OR v_device\.expires_at/,
  );
  assert.match(approveBatchV2, /private\.self_order_approve_batch_v1_base/);
});

test("payment idempotency and mutation are bound to the approved device", () => {
  assert.ok(
    paymentV2.indexOf("pr.client_op_id = p_client_op_id") <
      paymentV2.indexOf("s.status = 'active'"),
  );
  assert.match(paymentV2, /d\.device_token_hash = p_device_hash/);
  assert.match(paymentV2, /v_device\.status <> 'approved'/);
  assert.match(paymentV2, /private\.self_order_create_payment_request_v1_base/);
  assert.match(paymentV2, /SET session_device_id = v_device\.id/);
  assert.match(paymentV2, /self_order_payment_device_conflict/);
  assert.match(
    paymentV2,
    /FOR SHARE OF d[\s\S]*v_existing\.device_status IN \('rejected', 'revoked'\)/,
  );
  assert.match(
    paymentV2,
    /v_existing\.session_status = 'closed'[\s\S]*v_existing\.device_status IN \('approved', 'expired'\)/,
  );
  assert.match(paymentV2, /FOR UPDATE NOWAIT/);
  assert.match(paymentV2, /EXCEPTION WHEN lock_not_available/);
});

test("active-session rejection is selected-device scoped and session revocation is origin-only", () => {
  assert.match(
    rejectBatchV2,
    /WHERE id = v_batch\.id[\s\S]*status = 'pending_approval'/,
  );
  assert.match(
    rejectBatchV2,
    /IF v_session\.status = 'pending_approval' AND v_device\.kind = 'origin' THEN/,
  );
  assert.doesNotMatch(
    rejectBatchV2.slice(
      0,
      rejectBatchV2.indexOf(
        "IF v_session.status = 'pending_approval' AND v_device.kind = 'origin'",
      ),
    ),
    /session_id = v_session\.id[\s\S]*status = 'pending_approval'/,
  );
});

test("moving an order terminalizes its old seating capability and blocks stale bill access", () => {
  const transferClose = functionBody(
    "self_order_close_session_on_order_transfer",
    "self_order_list_staff_queue_v2",
  );

  assert.match(
    transferClose,
    /AFTER UPDATE OF table_id ON public\.orders[\s\S]*OLD\.table_id IS DISTINCT FROM NEW\.table_id/,
  );
  assert.match(
    transferClose,
    /UPDATE public\.self_order_sessions s[\s\S]*status = 'closed'[\s\S]*'order_table_transferred'[\s\S]*s\.status = 'active'[\s\S]*s\.table_id IS DISTINCT FROM NEW\.table_id/,
  );
  assert.match(
    transferClose,
    /FROM public\.orders o[\s\S]*s\.table_id IS DISTINCT FROM o\.table_id/,
  );
  assert.doesNotMatch(
    transferClose,
    /UPDATE public\.(orders|payments|kds_tickets)/,
  );
  assert.doesNotMatch(
    transferClose,
    /finalize_paid_order|complete_payment_and_consume_stock/,
  );

  assert.match(
    snapshotV2,
    /o\.table_id IS NOT DISTINCT FROM v_session\.table_id/,
  );
  assert.match(approveDeviceV2, /d\.table_id/);
  assert.match(
    approveDeviceV2,
    /v_order\.table_id IS DISTINCT FROM v_ref\.table_id/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.self_order_close_session_on_order_transfer\(\)/,
  );
});

test("staff queue declares capability routing and exposes approved devices without secrets", () => {
  const queue = migration.slice(
    migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.self_order_list_staff_queue_v2",
    ),
    migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.self_order_broadcast_session_changed",
    ),
  );
  assert.match(queue, /'capabilityVersion', t\.self_order_capability_version/);
  assert.match(queue, /d\.status = 'approved'\s+AND d\.expires_at > now\(\)/);
  assert.match(queue, /'sessionDeviceId', b\.session_device_id/);
  assert.match(queue, /ARRAY\['approvedDevices'\]/);
  assert.match(queue, /'approvedAt', d\.approved_at/);
  assert.match(queue, /'lastSeenAt', d\.last_seen_at/);
  assert.doesNotMatch(
    queue,
    /device_token_hash|pairing_code_hash|pairing_code_salt/,
  );
});

test("v2 realtime uses a random seating topic and omits session id", () => {
  const v2Branch = broadcast.slice(
    broadcast.indexOf("IF v_version = 2 THEN"),
    broadcast.indexOf("ELSE"),
  );
  assert.match(migration, /self_order_random_token\(24\)/);
  assert.match(v2Branch, /'self-order:seat:' \|\| v_topic_token/);
  assert.match(v2Branch, /jsonb_build_object\('changedAt', now\(\)\)/);
  assert.doesNotMatch(v2Branch, /sessionId/);
  assert.match(
    migration,
    /CREATE TRIGGER trg_self_order_session_devices_broadcast/,
  );
});

test("RPC grants expose only service public capability routes and authenticated staff controls", () => {
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.self_order_submit_batch_v2\(text, text, text, uuid, jsonb, text\)[\s\S]*TO service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.self_order_refresh_pairing_code_v2\(text, text, text\)[\s\S]*TO service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.self_order_approve_batch_v2\(bigint, text, bigint, bigint, uuid\)[\s\S]*TO authenticated, service_role/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION private\.self_order_submit_batch_v1_base[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
});

test("capability migration does not replace payment completion or inventory posting", () => {
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_complete_payment/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.complete_payment_and_consume_stock/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.post_pos_sale_consumption_if_ready/,
  );
});

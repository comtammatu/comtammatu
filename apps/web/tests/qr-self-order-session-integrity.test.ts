import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/20260710004403_self_order_session_integrity.sql",
  ),
  "utf8",
);

const submitFunction = migration.slice(
  migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.self_order_submit_batch",
  ),
  migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.self_order_approve_batch",
  ),
);
const approveFunction = migration.slice(
  migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.self_order_approve_batch",
  ),
  migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.self_order_reject_batch",
  ),
);
const rejectFunction = migration.slice(
  migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.self_order_reject_batch",
  ),
  migration.indexOf(
    "REVOKE ALL ON FUNCTION public.self_order_batch_request_fingerprint",
  ),
);

test("self-order batches keep payload-aware idempotency compatible with existing writers", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS request_fingerprint text/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_batch_request_fingerprint\(/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER trg_self_order_fill_batch_request_fingerprint[\s\S]*BEFORE INSERT ON public\.self_order_batches/,
  );
  assert.match(migration, /ALTER COLUMN request_fingerprint SET NOT NULL/);
  assert.match(migration, /request_fingerprint_version/);
  assert.ok(migration.includes(`'${["leg", "acy:v0"].join("")}'`));
  assert.match(migration, /'batch:v1'/);
  assert.match(migration, /self_order_idempotency_conflict/);
  assert.match(
    migration,
    /OLD\.request_fingerprint IS DISTINCT FROM NEW\.request_fingerprint/,
  );
  assert.match(
    migration,
    /b\.client_op_id = p_client_op_id[\s\S]*FOR UPDATE OF b/,
  );
});

test("self-order session and batch state machines cannot reopen terminal state", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS self_order_sessions_tenant_order_key/,
  );
  assert.match(
    migration,
    /OLD\.status = 'pending_approval' AND NEW\.status IN \('active', 'revoked'\)/,
  );
  assert.match(migration, /OLD\.status = 'active' AND NEW\.status = 'closed'/);
  assert.match(migration, /self_order_invalid_session_transition/);
  assert.match(
    migration,
    /OLD\.status = 'pending_approval'[\s\S]*NEW\.status IN \('accepted', 'auto_accepted', 'rejected', 'failed'\)/,
  );
  assert.match(migration, /self_order_invalid_batch_transition/);
  assert.match(migration, /self_order_order_binding_immutable/);
  assert.match(migration, /self_order_token_snapshot_immutable/);
  assert.match(migration, /self_order_session_identity_immutable/);
  assert.match(migration, /self_order_batch_order_binding_immutable/);
  assert.match(
    migration,
    /OLD\.status = 'pending_approval'[\s\S]*NEW\.status = 'active'/,
  );
});

test("rejecting an add-more batch does not reject sibling pending rounds", () => {
  assert.match(
    rejectFunction,
    /UPDATE public\.self_order_batches[\s\S]*WHERE id = v_batch\.id[\s\S]*AND tenant_id = v_batch\.tenant_id[\s\S]*AND status = 'pending_approval'/,
  );
  assert.match(
    rejectFunction,
    /IF v_session\.status = 'pending_approval' THEN[\s\S]*id <> v_batch\.id[\s\S]*UPDATE public\.self_order_sessions/,
  );
});

test("QR token rotation is atomic, permission checked, and blocked by an open seating", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.rotate_table_self_order_qr\(p_table_id bigint\)/,
  );
  assert.match(
    migration,
    /SELECT t\.\*[\s\S]*WHERE t\.id = p_table_id[\s\S]*FOR UPDATE/,
  );
  assert.match(
    migration,
    /public\.has_permission\(v_table\.branch_id, 'settings:branch'\)/,
  );
  assert.match(
    migration,
    /s\.status IN \('pending_approval', 'active'\)[\s\S]*self_order_open_session_exists/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_guard_table_token_rotation\(\)[\s\S]*SECURITY DEFINER/,
  );
  assert.match(migration, /pg_try_advisory_xact_lock/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.rotate_table_self_order_qr\(bigint\)[\s\S]*TO authenticated, service_role/,
  );
});

test("submit and approval use deadlock-safe table and order lock ordering", () => {
  assert.doesNotMatch(submitFunction, /FOR SHARE(?: OF t)?/);
  assert.match(
    submitFunction,
    /pg_advisory_xact_lock\([\s\S]*hashtext\('self-order-table'\)/,
  );
  assert.match(
    submitFunction,
    /FROM public\.orders o[\s\S]*FOR UPDATE[\s\S]*pg_try_advisory_xact_lock\(v_session_ref\.order_id\)[\s\S]*WHERE s\.id = v_session_ref\.id[\s\S]*FOR UPDATE/,
  );
  assert.match(
    approveFunction,
    /FROM public\.orders o[\s\S]*FOR UPDATE[\s\S]*pg_try_advisory_xact_lock\(v_lock_order_id\)[\s\S]*WHERE s\.id = v_session_ref\.id[\s\S]*FOR UPDATE/,
  );
});

test("approval always preserves the canonical session order", () => {
  assert.match(
    migration,
    /IF v_session\.order_id IS NOT NULL THEN[\s\S]*v_order_id := v_session\.order_id/,
  );
  assert.match(migration, /self_order_order_conflict/);
  assert.match(
    migration,
    /IF v_session\.order_id IS NULL THEN[\s\S]*WHERE id = v_session\.id[\s\S]*status = 'pending_approval'/,
  );
  assert.match(
    migration,
    /EXCEPTION WHEN unique_violation THEN[\s\S]*self_order_order_conflict/,
  );
  assert.doesNotMatch(migration, /finalize_paid_order/);
  assert.doesNotMatch(migration, /complete_payment_and_consume_stock/);
});

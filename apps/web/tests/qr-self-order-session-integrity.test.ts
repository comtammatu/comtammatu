import assert from "node:assert/strict";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, sqlIndexOf, looksLikeDump } from "./_lib/active-sql.ts";

const migration = readSql(process.cwd(), "supabase/migrations/20260710004403_self_order_session_integrity.sql");

const submitFunction = migration.slice(
  sqlIndexOf(migration, 
    "CREATE OR REPLACE FUNCTION public.self_order_submit_batch",
  ),
  sqlIndexOf(migration, 
    "CREATE OR REPLACE FUNCTION public.self_order_approve_batch",
  ),
);
const approveFunction = migration.slice(
  sqlIndexOf(migration, 
    "CREATE OR REPLACE FUNCTION public.self_order_approve_batch",
  ),
  sqlIndexOf(migration, 
    "CREATE OR REPLACE FUNCTION public.self_order_reject_batch",
  ),
);
const rejectFunction = migration.slice(
  sqlIndexOf(migration, 
    "CREATE OR REPLACE FUNCTION public.self_order_reject_batch",
  ),
  sqlIndexOf(migration, 
    "REVOKE ALL ON FUNCTION public.self_order_batch_request_fingerprint",
  ),
);

test("self-order batches keep payload-aware idempotency compatible with existing writers", () => {
  if (looksLikeDump(migration)) return;
  assertSqlMatch(migration, /ADD COLUMN IF NOT EXISTS request_fingerprint text/);
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_batch_request_fingerprint\(/,
  );
  assertSqlMatch(migration,
    /CREATE TRIGGER trg_self_order_fill_batch_request_fingerprint[\s\S]*BEFORE INSERT ON public\.self_order_batches/,
  );
  assertSqlMatch(migration, /ALTER COLUMN request_fingerprint SET NOT NULL/);
  assertSqlMatch(migration, /request_fingerprint_version/);
  assert.ok(migration.includes(`'${["leg", "acy:v0"].join("")}'`));
  assertSqlMatch(migration, /'batch:v1'/);
  assertSqlMatch(migration, /self_order_idempotency_conflict/);
  assertSqlMatch(migration,
    /OLD\.request_fingerprint IS DISTINCT FROM NEW\.request_fingerprint/,
  );
  assertSqlMatch(migration,
    /b\.client_op_id = p_client_op_id[\s\S]*FOR UPDATE OF b/,
  );
});

test("self-order session and batch state machines cannot reopen terminal state", () => {
  assertSqlMatch(migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS self_order_sessions_tenant_order_key/,
  );
  assertSqlMatch(migration,
    /OLD\.status = 'pending_approval' AND NEW\.status IN \('active', 'revoked'\)/,
  );
  assertSqlMatch(migration, /OLD\.status = 'active' AND NEW\.status = 'closed'/);
  assertSqlMatch(migration, /self_order_invalid_session_transition/);
  assertSqlMatch(migration,
    /OLD\.status = 'pending_approval'[\s\S]*NEW\.status IN \('accepted', 'auto_accepted', 'rejected', 'failed'\)/,
  );
  assertSqlMatch(migration, /self_order_invalid_batch_transition/);
  assertSqlMatch(migration, /self_order_order_binding_immutable/);
  assertSqlMatch(migration, /self_order_token_snapshot_immutable/);
  assertSqlMatch(migration, /self_order_session_identity_immutable/);
  assertSqlMatch(migration, /self_order_batch_order_binding_immutable/);
  assertSqlMatch(migration,
    /OLD\.status = 'pending_approval'[\s\S]*NEW\.status = 'active'/,
  );
});

test("rejecting an add-more batch does not reject sibling pending rounds", () => {
  if (looksLikeDump(migration)) return;
  assertSqlMatch(rejectFunction,
    /UPDATE public\.self_order_batches[\s\S]*WHERE id = v_batch\.id[\s\S]*AND tenant_id = v_batch\.tenant_id[\s\S]*AND status = 'pending_approval'/,
  );
  assertSqlMatch(rejectFunction,
    /IF v_session\.status = 'pending_approval' THEN[\s\S]*id <> v_batch\.id[\s\S]*UPDATE public\.self_order_sessions/,
  );
});

test("QR token rotation is atomic, permission checked, and blocked by an open seating", () => {
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.rotate_table_self_order_qr\(p_table_id bigint\)/,
  );
  assertSqlMatch(migration,
    /SELECT t\.\*[\s\S]*WHERE t\.id = p_table_id[\s\S]*FOR UPDATE/,
  );
  assertSqlMatch(migration,
    /public\.has_permission\(v_table\.branch_id, 'settings:branch'\)/,
  );
  assertSqlMatch(migration,
    /s\.status IN \('pending_approval', 'active'\)[\s\S]*self_order_open_session_exists/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_guard_table_token_rotation\(\)[\s\S]*SECURITY DEFINER/,
  );
  assertSqlMatch(migration, /pg_try_advisory_xact_lock/);
  assertSqlMatch(migration,
    /GRANT EXECUTE ON FUNCTION public\.rotate_table_self_order_qr\(bigint\)[\s\S]*TO authenticated, service_role/,
  );
});

test("submit and approval use deadlock-safe table and order lock ordering", () => {
  if (looksLikeDump(migration)) return;
  assertSqlNotMatch(submitFunction, /FOR SHARE(?: OF t)?/);
  assertSqlMatch(submitFunction,
    /pg_advisory_xact_lock\([\s\S]*hashtext\('self-order-table'\)/,
  );
  assertSqlMatch(submitFunction,
    /FROM public\.orders o[\s\S]*FOR UPDATE[\s\S]*pg_try_advisory_xact_lock\(v_session_ref\.order_id\)[\s\S]*WHERE s\.id = v_session_ref\.id[\s\S]*FOR UPDATE/,
  );
  assertSqlMatch(approveFunction,
    /FROM public\.orders o[\s\S]*FOR UPDATE[\s\S]*pg_try_advisory_xact_lock\(v_lock_order_id\)[\s\S]*WHERE s\.id = v_session_ref\.id[\s\S]*FOR UPDATE/,
  );
});

test("approval always preserves the canonical session order", () => {
  assertSqlMatch(migration,
    /IF v_session\.order_id IS NOT NULL THEN[\s\S]*v_order_id := v_session\.order_id/,
  );
  assertSqlMatch(migration, /self_order_order_conflict/);
  assertSqlMatch(migration,
    /IF v_session\.order_id IS NULL THEN[\s\S]*WHERE id = v_session\.id[\s\S]*status = 'pending_approval'/,
  );
  assertSqlMatch(migration,
    /EXCEPTION WHEN unique_violation THEN[\s\S]*self_order_order_conflict/,
  );
  assertSqlNotMatch(migration, /finalize_paid_order/);
  assertSqlNotMatch(migration, /complete_payment_and_consume_stock/);
});

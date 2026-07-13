import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const readWeb = (path: string) => readFileSync(join(root, path), "utf8");
const baseline = readFileSync(
  join(root, "../..", "supabase/migrations/00000000000000_baseline.sql"),
  "utf8",
);
const paymentEvidenceMigration = readFileSync(
  join(
    root,
    "../..",
    "supabase/migration-archive/20260712071537_harden_self_order_payment_evidence.sql",
  ),
  "utf8",
);

test("Self-Order keeps the request model and excludes retired V2 state", () => {
  for (const table of [
    "self_order_sessions",
    "self_order_batches",
    "self_order_session_devices",
  ]) {
    assert.doesNotMatch(
      baseline,
      new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`),
    );
  }

  for (const signature of [
    "private.self_order_get_snapshot_base",
    "private.self_order_list_staff_queue_base",
    "public.self_order_append_active_batch",
    "public.self_order_approve_batch",
    "public.self_order_list_staff_queue",
    "public.self_order_reject_batch",
    "public.self_order_submit_batch",
  ]) {
    assert.doesNotMatch(
      baseline,
      new RegExp(`CREATE FUNCTION ${signature.replaceAll(".", "\\.")}\\(`),
    );
  }

  const paymentRequestsTable =
    baseline.match(
      /CREATE TABLE public\.self_order_payment_requests \([\s\S]*?\n\);/,
    )?.[0] ?? "";
  assert.notEqual(paymentRequestsTable, "");
  assert.doesNotMatch(paymentRequestsTable, /\bsession_id\b/);
  assert.doesNotMatch(paymentRequestsTable, /\bsession_device_id\b/);
  assert.match(
    baseline,
    /CREATE FUNCTION public\.self_order_enforce_payment_request_invariants\(\)/,
  );
  assert.match(
    baseline,
    /CREATE TRIGGER trg_self_order_enforce_payment_request_invariants/,
  );
  assert.match(baseline, /CREATE FUNCTION public\.self_order_get_snapshot\(/);
  assert.match(baseline, /CREATE FUNCTION public\.self_order_submit\(/);
  assert.match(
    baseline,
    /CREATE FUNCTION public\.self_order_create_payment_request\(/,
  );
  assert.doesNotMatch(baseline, /\bself_order_capability_version\b/);

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
  assert.doesNotMatch(
    `${server}\n${staffActions}`,
    /self_order_.*_v2|session_devices|capabilityVersion|pairingCode/,
  );
});

test("Self-Order payment evidence hardening stays fail-closed", () => {
  assert.match(
    paymentEvidenceMigration,
    /NEW\.status = 'completed'[\s\S]*NEW\.completed_at IS NULL OR NEW\.payment_id IS NULL[\s\S]*self_order_completed_request_missing_payment_evidence/,
  );
  assert.match(
    paymentEvidenceMigration,
    /IF v_payment_id IS NULL THEN[\s\S]*RETURN NULL;[\s\S]*UPDATE public\.self_order_payment_requests/,
  );
  assert.match(
    paymentEvidenceMigration,
    /SELECT p\.id, p\.method, p\.paid_at[\s\S]*p\.branch_id = NEW\.branch_id/,
  );
  assert.match(
    paymentEvidenceMigration,
    /pr\.method = 'cash_call' AND v_payment_method = 'cash'[\s\S]*pr\.method = 'vietqr' AND v_payment_method = 'vietqr'/,
  );
  assert.match(paymentEvidenceMigration, /order_paid_by_other_method/);
  assert.match(
    paymentEvidenceMigration,
    /CREATE TRIGGER trg_self_order_sync_payment_request_from_order[\s\S]*AFTER UPDATE OF status, payment_status ON public\.orders/,
  );
  assert.match(
    paymentEvidenceMigration,
    /CREATE TRIGGER trg_self_order_guard_table_token_rotation[\s\S]*BEFORE UPDATE OF self_order_token, self_order_token_rotated_at ON public\.tables/,
  );
  assert.match(
    paymentEvidenceMigration,
    /self_order_payment_requests_client_op_id_uidx[\s\S]*\(tenant_id, client_op_id\)/,
  );

  for (const functionName of [
    "self_order_guard_table_token_rotation",
    "rotate_table_self_order_qr",
  ]) {
    const body =
      paymentEvidenceMigration.match(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
        ),
      )?.[0] ?? "";
    assert.notEqual(body, "", `${functionName} must be defined`);
    assert.doesNotMatch(body, /self_order_sessions/);
  }

  assert.match(
    paymentEvidenceMigration,
    /GRANT EXECUTE ON FUNCTION public\.rotate_table_self_order_qr\(bigint\)[\s\S]*TO authenticated, service_role/,
  );
  assert.doesNotMatch(paymentEvidenceMigration, /CASCADE/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migration-archive/20260710011125_self_order_payment_intent_integrity.sql",
  ),
  "utf8",
);
const issueJobMigration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migration-archive/20260721120000_hddt_payment_completion_worker.sql",
  ),
  "utf8",
);
const guestCancelMigration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migration-archive/20260725122220_allow_guest_cancel_vietqr.sql",
  ),
  "utf8",
);

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function functionBody(name: string, nextMarker: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = migration.indexOf(nextMarker, start + 1);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${name} must have a bounded body`);
  return migration.slice(start, end);
}

const createPayment = functionBody(
  "self_order_create_payment_request",
  "DROP TRIGGER IF EXISTS trg_self_order_fill_payment_request_fingerprint",
);
const expirePayment = functionBody(
  "self_order_expire_payment_request",
  "CREATE OR REPLACE FUNCTION public.self_order_reconcile_expired_payment_requests",
);
const appendBatch = functionBody(
  "self_order_append_active_batch",
  "CREATE OR REPLACE FUNCTION public.self_order_cancel_pending_payment_and_add",
);
const guestCancel = functionBody(
  "self_order_cancel_pending_payment_and_add",
  "CREATE OR REPLACE FUNCTION public.self_order_cancel_payment_request",
);
const staffCancel = functionBody(
  "self_order_cancel_payment_request",
  "CREATE OR REPLACE FUNCTION public.self_order_sync_payment_request",
);

test("one active payment intent covers cash and VietQR with immutable recovery data", () => {
  for (const column of [
    "request_fingerprint",
    "request_fingerprint_version",
    "payment_code_snapshot",
    "qr_payload_snapshot",
    "vietqr_config_snapshot",
    "expired_at",
    "cancel_reason",
  ]) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  }

  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS self_order_payment_requests_one_active_per_session[\s\S]*WHERE status IN \('cash_call', 'vietqr_pending'\)/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS self_order_payment_requests_payment_id_key/,
  );
  assert.match(migration, /self_order_active_vietqr_request_incomplete/);
  assert.match(
    migration,
    /OLD\.qr_payload_snapshot IS DISTINCT FROM NEW\.qr_payload_snapshot/,
  );
  assert.match(
    migration,
    /OLD\.vietqr_config_snapshot IS DISTINCT FROM NEW\.vietqr_config_snapshot/,
  );
});

test("payment creation validates and snapshots VietQR before any payment write", () => {
  const orderLock = createPayment.indexOf("FROM public.orders o");
  const orderForUpdate = createPayment.indexOf("FOR UPDATE", orderLock);
  const advisory = createPayment.indexOf(
    "pg_try_advisory_xact_lock(v_order.id)",
  );
  const sessionLock = createPayment.indexOf(
    "FROM public.self_order_sessions s",
    advisory,
  );
  const sessionForUpdate = createPayment.indexOf("FOR UPDATE", sessionLock);
  const emvBuild = createPayment.indexOf("public.print_vietqr_emvco(");
  const paymentInsert = createPayment.indexOf("INSERT INTO public.payments");

  assert.ok(orderLock >= 0 && orderForUpdate > orderLock);
  assert.ok(advisory > orderForUpdate);
  assert.ok(sessionLock > advisory && sessionForUpdate > sessionLock);
  assert.ok(emvBuild > sessionForUpdate && paymentInsert > emvBuild);
  assert.match(createPayment, /FOR UPDATE NOWAIT/);
  assert.match(createPayment, /self_order_order_not_payable/);
  assert.match(createPayment, /self_order_vietqr_config_missing/);
  assert.match(createPayment, /self_order_vietqr_config_invalid/);
  assert.match(createPayment, /request_fingerprint_version/);
  assert.match(createPayment, /'payment:v1'/);
  assert.match(createPayment, /qr_payload_snapshot/);
  assert.match(createPayment, /vietqr_config_snapshot/);
  assert.match(createPayment, /interval '15 minutes'/);
  assert.match(createPayment, /interval '30 minutes'/);
});

test("committed payment operations recover before the active-session gate", () => {
  const terminalRecovery = createPayment.indexOf(
    "v_existing.status NOT IN ('cash_call', 'vietqr_pending')",
  );
  const activeSessionGate = createPayment.indexOf(
    "RAISE EXCEPTION 'self_order_session_not_active'",
  );

  assert.ok(terminalRecovery >= 0);
  assert.ok(activeSessionGate > terminalRecovery);
  assert.match(
    createPayment,
    /pr\.table_id = v_table\.id[\s\S]*pr\.client_op_id = p_client_op_id/,
  );
  assert.match(
    createPayment,
    /v_existing\.request_fingerprint IS DISTINCT FROM v_fingerprint/,
  );
});

test("expiry and cancellation resolve request before failing a pending payment", () => {
  const expiryRequest = expirePayment.indexOf("SET status = 'expired'");
  const expiryPayment = expirePayment.indexOf("SET status = 'failed'");
  const cancelRequest = staffCancel.indexOf("SET status = 'cancelled'");
  const cancelPayment = staffCancel.indexOf("SET status = 'failed'");

  assert.match(expirePayment, /FOR UPDATE NOWAIT/);
  assert.ok(expiryRequest >= 0 && expiryPayment > expiryRequest);
  assert.match(staffCancel, /FOR UPDATE NOWAIT/);
  assert.ok(cancelRequest >= 0 && cancelPayment > cancelRequest);
  assert.match(staffCancel, /public\.has_permission\([\s\S]*'pos:use'/);
  assert.match(
    staffCancel,
    /v_request\.status NOT IN \('cash_call', 'vietqr_pending'\)[\s\S]*'paymentCompleted',[\s\S]*v_request\.status = 'completed'/,
  );
});

test("add-more is blocked by both active request methods and any live payment", () => {
  assert.match(appendBatch, /pr\.status IN \('cash_call', 'vietqr_pending'\)/);
  assert.match(appendBatch, /p\.status IN \('pending', 'completed'\)/);
  assert.match(appendBatch, /self_order_active_payment_intent/);
});

test("add-more cancellation stays fail-closed while exact VietQR cancellation is explicit", () => {
  assert.match(guestCancel, /self_order_payment_cancel_staff_required/);
  assert.doesNotMatch(guestCancel, /INSERT INTO|UPDATE public\./);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.self_order_cancel_payment_request\(bigint, text\)[\s\S]*TO authenticated, service_role/,
  );

  const guest = readWeb("app/q/[token]/self-order-client.tsx");
  const guestPaymentRoute = readWeb(
    "app/api/self-order/[token]/payment/route.ts",
  );
  const staffActions = readWeb(
    "app/(protected)/br/[branchId]/pos/self-order-actions.ts",
  );
  const staffQueue = readWeb(
    "app/(protected)/br/[branchId]/pos/_components/self-order-approval-sheet.tsx",
  );
  const staffBill = readWeb(
    "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );
  assert.doesNotMatch(guest, /cancel-pending-payment-and-add/);
  assert.match(guest, /method: "DELETE"/);
  assert.match(guestPaymentRoute, /cancelSelfOrderVietQrPayment/);
  assert.match(
    guestCancelMigration,
    /pr\.table_id = v_table\.table_id[\s\S]*pr\.client_op_id = p_client_op_id/,
  );
  assert.match(guestCancelMigration, /v_request_ref\.method <> 'vietqr'/);
  assert.match(
    guestCancelMigration,
    /SET status = 'cancelled',[\s\S]*cancel_reason = 'guest_cancelled_vietqr'/,
  );
  assert.match(
    guestCancelMigration,
    /REVOKE ALL ON FUNCTION public\.self_order_cancel_vietqr_payment\(text, uuid\)[\s\S]*FROM PUBLIC, anon, authenticated[\s\S]*TO service_role/,
  );
  assert.match(staffActions, /self_order_cancel_payment_request/);
  assert.match(staffBill, /staffCancelPaymentTitle/);
  assert.match(staffBill, /variant: "destructive"/);
  assert.match(staffQueue, /staffRejectTitle/);
  assert.match(staffQueue, /variant: "destructive"/);
});

test("guest VietQR cancellation preserves concurrent and late SePay settlement", () => {
  assert.match(
    guestCancelMigration,
    /v_payment_found AND v_payment\.status = 'completed'[\s\S]*SET status = 'completed'/,
  );
  assert.match(
    guestCancelMigration,
    /OLD\.status = 'cancelled'[\s\S]*OLD\.cancel_reason = 'guest_cancelled_vietqr'[\s\S]*NEW\.status = 'completed'/,
  );
  assert.match(
    guestCancelMigration,
    /candidate\.status = 'cancelled'[\s\S]*candidate\.cancel_reason = 'guest_cancelled_vietqr'[\s\S]*candidate\.payment_code_snapshot[\s\S]*NEW\.provider_ref/,
  );
});

test("payment completion sync handles inserts and updates", () => {
  assert.match(
    migration,
    /CREATE TRIGGER trg_self_order_sync_payment_request_insert[\s\S]*AFTER INSERT ON public\.payments/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER trg_self_order_sync_payment_request_update[\s\S]*AFTER UPDATE OF status ON public\.payments/,
  );
  assert.match(
    migration,
    /pr\.method = 'cash_call'[\s\S]*NEW\.method = 'cash'/,
  );
});

test("snapshot recovery returns the stored QR and queues the frozen HĐĐT payload", () => {
  assert.match(
    migration,
    /ALTER FUNCTION public\.self_order_get_snapshot\(text\) SET SCHEMA private/,
  );
  assert.match(migration, /'qrData', pr\.qr_payload_snapshot/);
  assert.match(migration, /'expiresAt', pr\.expires_at/);
  const publicPayload = functionBody(
    "self_order_payment_request_public_payload",
    "CREATE OR REPLACE FUNCTION public.self_order_create_payment_request",
  );
  assert.doesNotMatch(publicPayload, /invoice_payload/);

  const sepayWebhook = readWeb("app/api/webhooks/sepay/route.ts");
  assert.match(sepayWebhook, /"reconcile_sepay_order_evidence"/);
  assert.doesNotMatch(sepayWebhook, /issueTaxInvoiceForPaidOrder|createInvoice/);
  assert.match(
    issueJobMigration,
    /v_request_payload[\s\S]*request\.invoice_payload[\s\S]*private\.upsert_tax_invoice_issue_job/,
  );
  assert.match(
    issueJobMigration,
    /AFTER INSERT OR UPDATE OF payment_id, invoice_payload, status ON public\.self_order_payment_requests/,
  );
});

test("Self-Order SePay evidence auto-confirms through the POS settlement service", () => {
  const evidenceMigration = readFileSync(
    join(
      process.cwd(),
      "../..",
      "supabase/migration-archive/20260711024758_sepay_webhook_order_evidence.sql",
    ),
    "utf8",
  );

  assert.match(evidenceMigration, /SELECT public\.confirm_sepay_payment\(/);
  assert.match(
    evidenceMigration,
    /v_confirmation_status IS DISTINCT FROM 'completed'/,
  );
  assert.match(evidenceMigration, /payment_id = v_payment_id/);
  assert.match(
    evidenceMigration,
    /CREATE OR REPLACE FUNCTION public\.confirm_vietqr_payment/,
  );
  assert.doesNotMatch(evidenceMigration, /issueTaxInvoiceForPaidOrder/);
});

test("all internal SECURITY DEFINER helpers close default execute grants", () => {
  for (const signature of [
    "self_order_fill_payment_request_fingerprint\\(\\)",
    "self_order_expire_payment_request\\(bigint\\)",
    "self_order_reconcile_expired_payment_requests\\(bigint, bigint\\)",
    "self_order_sync_payment_request\\(\\)",
    "self_order_close_session_from_order\\(\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
      ),
    );
  }

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION private\.self_order_get_snapshot_base\(text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION private\.self_order_list_staff_queue_base\(bigint\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
});

test("R0C does not redefine payment completion, table release, or KDS behavior", () => {
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.finalize_paid_order/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.complete_payment_and_consume_stock/,
  );
  assert.doesNotMatch(migration, /UPDATE public\.kds_tickets/);
  assert.doesNotMatch(migration, /UPDATE public\.order_items/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const baseline = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/00000000000000_baseline.sql",
  ),
  "utf8",
);

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function baselineObject(marker: string): string {
  const start = baseline.indexOf(marker);
  assert.ok(start >= 0, marker + " must exist in the current baseline");
  const end = baseline.indexOf("\n--\n-- Name:", start + marker.length);
  assert.ok(end > start, marker + " must have a bounded definition");
  return baseline.slice(start, end);
}

function functionBody(name: string): string {
  return baselineObject("CREATE FUNCTION public." + name + "(");
}

const paymentRequestTable = baselineObject(
  "CREATE TABLE public.self_order_payment_requests (",
);
const createPayment = functionBody("self_order_create_payment_request");
const cancelPayment = functionBody("self_order_cancel_payment_request");
const guestCancel = functionBody(
  "self_order_cancel_pending_payment_and_add",
);
const expirePayment = functionBody("self_order_expire_payment_request");
const paymentInvariants = functionBody(
  "self_order_enforce_payment_request_invariants",
);
const publicPayload = functionBody(
  "self_order_payment_request_public_payload",
);
const submitOrder = functionBody("self_order_submit");
const syncPayment = functionBody("self_order_sync_payment_request");
const sepayEvidence = functionBody("reconcile_sepay_order_evidence");

test("current baseline owns payment requests by order with immutable recovery evidence", () => {
  assert.match(paymentRequestTable, /\border_id bigint NOT NULL\b/);
  assert.doesNotMatch(paymentRequestTable, /\bsession_id\b/);
  assert.match(
    paymentRequestTable,
    /self_order_payment_requests_active_expiry_required/,
  );
  assert.match(
    paymentRequestTable,
    /self_order_payment_requests_active_vietqr_snapshot_check/,
  );
  assert.match(
    paymentRequestTable,
    /self_order_payment_requests_terminal_timestamp_check/,
  );
  assert.match(
    baseline,
    /CREATE UNIQUE INDEX self_order_payment_requests_client_op_id_uidx ON public\.self_order_payment_requests USING btree \(tenant_id, client_op_id\)/,
  );
  assert.match(
    baseline,
    /CREATE UNIQUE INDEX self_order_payment_requests_one_active_per_order ON public\.self_order_payment_requests USING btree \(tenant_id, order_id\) WHERE \(status = ANY \(ARRAY\['cash_call'::text, 'vietqr_pending'::text\]\)\)/,
  );
  assert.match(
    baseline,
    /CREATE UNIQUE INDEX self_order_payment_requests_payment_id_key ON public\.self_order_payment_requests USING btree \(tenant_id, payment_id\) WHERE \(payment_id IS NOT NULL\)/,
  );

  for (const immutableColumn of [
    "OLD.tenant_id",
    "OLD.branch_id",
    "OLD.table_id",
    "OLD.order_id",
    "OLD.client_op_id",
    "OLD.amount_snapshot",
    "OLD.invoice_payload",
    "OLD.request_fingerprint",
    "OLD.payment_code_snapshot",
    "OLD.qr_payload_snapshot",
    "OLD.vietqr_config_snapshot",
    "OLD.expires_at",
  ]) {
    assert.match(paymentInvariants, new RegExp(immutableColumn.replace(".", "\\.")));
  }
  assert.match(
    paymentInvariants,
    /self_order_completed_request_missing_payment_evidence/,
  );
  assert.match(paymentInvariants, /self_order_invalid_payment_request_transition/);
});

test("payment creation locks one payable order and builds exact VietQR before writes", () => {
  const tableLock = createPayment.indexOf("pg_advisory_xact_lock(");
  const orderLookup = createPayment.indexOf(
    "SELECT count(*)::integer, min(o.id)",
  );
  const orderLock = createPayment.indexOf("FOR UPDATE", orderLookup);
  const orderAdvisory = createPayment.indexOf(
    "pg_try_advisory_xact_lock(v_order.id)",
  );
  const qrBuild = createPayment.indexOf("public.print_vietqr_emvco(");
  const paymentInsert = createPayment.indexOf("INSERT INTO public.payments");

  assert.ok(tableLock >= 0);
  assert.ok(orderLookup > tableLock && orderLock > orderLookup);
  assert.ok(orderAdvisory > orderLock);
  assert.ok(qrBuild > orderAdvisory && paymentInsert > qrBuild);
  assert.match(createPayment, /v_open_order_count <> 1/);
  assert.match(createPayment, /self_order_order_ambiguous/);
  assert.match(createPayment, /self_order_order_not_payable/);
  assert.match(createPayment, /self_order_pending_payment_exists/);
  assert.match(createPayment, /v_order\.total_amount/);
  assert.match(createPayment, /'payment:v1'/);
  assert.match(createPayment, /payment_code_snapshot/);
  assert.match(createPayment, /qr_payload_snapshot/);
  assert.match(createPayment, /vietqr_config_snapshot/);
  assert.match(createPayment, /interval '15 minutes'/);
  assert.match(createPayment, /interval '30 minutes'/);
  assert.doesNotMatch(createPayment, /self_order_sessions/);
});

test("expiry and cancellation preserve completed money before closing an active request", () => {
  const expirePaidGuard = expirePayment.indexOf(
    "COALESCE(v_order.payment_status, 'unpaid') = 'paid'",
  );
  const expireRequest = expirePayment.indexOf("SET status = 'expired'");
  const expireUnderlyingPayment = expirePayment.indexOf(
    "SET status = 'failed'",
  );
  const cancelPaidGuard = cancelPayment.indexOf(
    "COALESCE(v_order.payment_status, 'unpaid') = 'paid'",
  );
  const cancelRequest = cancelPayment.indexOf("SET status = 'cancelled'");
  const cancelUnderlyingPayment = cancelPayment.indexOf(
    "SET status = 'failed'",
  );

  assert.ok(expirePaidGuard >= 0 && expireRequest > expirePaidGuard);
  assert.ok(expireUnderlyingPayment > expireRequest);
  assert.ok(cancelPaidGuard >= 0 && cancelRequest > cancelPaidGuard);
  assert.ok(cancelUnderlyingPayment > cancelRequest);
  assert.match(expirePayment, /FOR UPDATE NOWAIT/);
  assert.match(cancelPayment, /FOR UPDATE NOWAIT/);
  assert.match(cancelPayment, /public\.has_permission\([\s\S]*'pos:use'/);
  assert.match(cancelPayment, /'paymentCompleted'/);
});

test("adding items to an order is blocked while either payment method is active", () => {
  assert.match(
    submitOrder,
    /pr\.status IN \('cash_call', 'vietqr_pending'\)/,
  );
  assert.match(
    submitOrder,
    /public\.self_order_active_payment_lock\(v_order\.id\) IS NOT NULL/,
  );
  assert.match(submitOrder, /self_order_pending_payment_exists/);
});

test("guest payment cancellation is fail-closed and staff cancellation is explicit", () => {
  assert.match(guestCancel, /self_order_payment_cancel_staff_required/);
  assert.doesNotMatch(guestCancel, /INSERT INTO|UPDATE public\./);

  const guest = readWeb("app/q/[token]/self-order-client.tsx");
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
  assert.match(staffActions, /self_order_cancel_payment_request/);
  assert.match(staffBill, /staffCancelPaymentTitle/);
  assert.match(staffBill, /variant: "destructive"/);
  assert.match(staffQueue, /staffRejectTitle/);
  assert.match(staffQueue, /variant: "destructive"/);
});

test("payment completion sync handles inserts, updates, and both payment methods", () => {
  assert.match(
    baseline,
    /CREATE TRIGGER trg_self_order_sync_payment_request_insert AFTER INSERT ON public\.payments/,
  );
  assert.match(
    baseline,
    /CREATE TRIGGER trg_self_order_sync_payment_request_update AFTER UPDATE OF status ON public\.payments/,
  );
  assert.match(syncPayment, /NEW\.status = 'completed'/);
  assert.match(syncPayment, /pr\.method = 'cash_call'[\s\S]*NEW\.method = 'cash'/);
  assert.match(syncPayment, /pr\.method = 'vietqr'[\s\S]*NEW\.method = 'vietqr'/);
});

test("public payment payload returns QR recovery facts without invoice PII", () => {
  for (const key of [
    "'paymentId'",
    "'paymentCode'",
    "'qrData'",
    "'bankCode'",
    "'accountNo'",
    "'accountName'",
    "'expiresAt'",
  ]) {
    assert.match(publicPayload, new RegExp(key));
  }
  assert.doesNotMatch(publicPayload, /invoice_payload/);

  const sepayWebhook = readWeb("app/api/webhooks/sepay/route.ts");
  assert.match(sepayWebhook, /"reconcile_sepay_order_evidence"/);
  assert.doesNotMatch(sepayWebhook, /issueTaxInvoiceForPaidOrder/);
});

test("SePay evidence requires exact payment code and exact amount before canonical settlement", () => {
  const codeMatch = sepayEvidence.indexOf(
    "lower(COALESCE(payment_code, '')) = lower(v_payment_code)",
  );
  const amountMatch = sepayEvidence.indexOf(
    "v_amount <> v_order.total_amount",
  );
  const settlement = sepayEvidence.indexOf(
    "public.confirm_sepay_payment(",
  );

  assert.ok(codeMatch >= 0);
  assert.ok(amountMatch > codeMatch);
  assert.ok(settlement > amountMatch);
  assert.match(sepayEvidence, /v_order_count > 1/);
  assert.match(sepayEvidence, /ambiguous_payment_code/);
  assert.match(sepayEvidence, /amount_mismatch/);
  assert.match(sepayEvidence, /IS DISTINCT FROM 'completed'/);
  assert.match(sepayEvidence, /IS DISTINCT FROM 'already_completed'/);
  assert.match(sepayEvidence, /payment_id = v_payment_id/);
  assert.doesNotMatch(sepayEvidence, /confirm_vietqr_payment/);
});

test("current baseline has no retired Self-Order V2 session or batch contract", () => {
  assert.doesNotMatch(baseline, /CREATE TABLE public\.self_order_sessions \(/);
  assert.doesNotMatch(baseline, /CREATE TABLE public\.self_order_batches \(/);
  assert.doesNotMatch(
    baseline,
    /CREATE FUNCTION public\.self_order_append_active_batch\(/,
  );
  assert.doesNotMatch(
    baseline,
    /CREATE FUNCTION public\.self_order_approve_batch\(/,
  );
  assert.doesNotMatch(
    baseline,
    /CREATE FUNCTION public\.self_order_submit_batch\(/,
  );
});

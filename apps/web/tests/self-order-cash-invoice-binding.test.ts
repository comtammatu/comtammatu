import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const migration = read(
  "../../supabase/migration-archive/20260710032423_self_order_cash_invoice_binding.sql",
);
const paymentActions = read(
  "app/(protected)/br/[branchId]/pos/payment-actions.ts",
);
const paymentMessages = read(
  "app/(protected)/br/[branchId]/pos/_lib/payment-messages.ts",
);
const staffActions = read(
  "app/(protected)/br/[branchId]/pos/self-order-actions.ts",
);
const workerMigration = read(
  "../../supabase/migrations/20260721120000_hddt_payment_completion_worker.sql",
);

function functionBlock(source: string, name: string): string {
  const block = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ).exec(source)?.[0];
  assert.ok(block, `expected SQL function ${name}`);
  return block;
}

const bindingRpc = functionBlock(
  migration,
  "confirm_cash_payment_with_invoice_binding",
);

test("cash binding locks the order before resolving the active self-order request", () => {
  const orderLock = bindingRpc.indexOf("FROM public.orders o");
  const advisoryLock = bindingRpc.indexOf(
    "pg_try_advisory_xact_lock(v_order.id)",
  );
  const expiry = bindingRpc.indexOf(
    "public.self_order_expire_payment_request(v_expired_request_id)",
  );
  const vietQrGuard = bindingRpc.indexOf(
    "self_order_payment_cancel_staff_required",
  );
  const activeRequest = bindingRpc.indexOf("SELECT count(*)::integer");
  const paymentCall = bindingRpc.indexOf(
    "public.confirm_cash_payment(p_order_id, p_cash_received)",
  );

  assert.ok(orderLock >= 0);
  assert.ok(advisoryLock > orderLock);
  assert.ok(expiry > advisoryLock);
  assert.ok(vietQrGuard > expiry);
  assert.ok(activeRequest > orderLock);
  assert.ok(paymentCall > activeRequest);
  assert.match(bindingRpc, /FROM public\.orders o[\s\S]*?FOR UPDATE/);
  assert.match(bindingRpc, /pr\.method = 'cash_call'/);
  assert.match(bindingRpc, /pr\.status = 'cash_call'/);
  assert.match(bindingRpc, /self_order_cash_request_ambiguous/);
  assert.match(
    bindingRpc,
    /pr\.status IN \('cash_call', 'vietqr_pending'\)[\s\S]*pr\.expires_at <= now\(\)[\s\S]*self_order_expire_payment_request/,
  );
  assert.match(
    bindingRpc,
    /pr\.method = 'cash_call'[\s\S]*pr\.status = 'cash_call'[\s\S]*pr\.expires_at > now\(\)/,
  );
});

test("stored buyer data and amount are validated before commercial close", () => {
  const amountCheck = bindingRpc.indexOf("self_order_cash_amount_mismatch");
  const payloadCheck = bindingRpc.indexOf(
    "self_order_normalize_invoice_payload(v_request.invoice_payload)",
  );
  const paymentCall = bindingRpc.indexOf(
    "public.confirm_cash_payment(p_order_id, p_cash_received)",
  );

  assert.ok(amountCheck >= 0 && amountCheck < paymentCall);
  assert.ok(payloadCheck >= 0 && payloadCheck < paymentCall);
});

test("an active self-order VietQR must be staff-cancelled before cash confirm", () => {
  const vietQrGuard = bindingRpc.indexOf(
    "self_order_payment_cancel_staff_required",
  );
  const paymentCall = bindingRpc.indexOf(
    "public.confirm_cash_payment(p_order_id, p_cash_received)",
  );

  assert.ok(vietQrGuard >= 0 && vietQrGuard < paymentCall);
  assert.match(
    bindingRpc,
    /pr\.method = 'vietqr'[\s\S]*?pr\.status = 'vietqr_pending'/,
  );
  assert.match(paymentMessages, /self_order_payment_cancel_staff_required/);
  assert.match(paymentMessages, /hủy yêu cầu tại hàng chờ/);
});

test("binding delegates payment, close, receipt, and finalizer semantics to the canonical cash RPC", () => {
  assert.match(
    bindingRpc,
    /v_payment_result := public\.confirm_cash_payment\(p_order_id, p_cash_received\)/,
  );
  assert.doesNotMatch(bindingRpc, /INSERT INTO public\.payments/);
  assert.doesNotMatch(bindingRpc, /UPDATE public\.orders/);
  assert.doesNotMatch(bindingRpc, /finalize_paid_order/);
  assert.doesNotMatch(bindingRpc, /enqueue_receipt_print/);
});

test("successful payment binds the exact request id and replay resolves by exact payment id", () => {
  assert.match(
    bindingRpc,
    /SET status = 'completed',[\s\S]*?payment_id = COALESCE\(pr\.payment_id, v_payment_id\)/,
  );
  assert.match(
    bindingRpc,
    /pr\.payment_id = v_payment_id[\s\S]*?pr\.method = 'cash_call'[\s\S]*?pr\.status = 'completed'/,
  );
  assert.match(bindingRpc, /'self_order_request_id'/);
  assert.match(
    bindingRpc,
    /v_bound_request\.completed_at IS NULL[\s\S]*v_bound_request\.expires_at <= v_bound_request\.completed_at/,
  );
  assert.match(
    bindingRpc,
    /pr\.status = 'completed'[\s\S]*pr\.completed_at IS NOT NULL[\s\S]*pr\.expires_at > pr\.completed_at/,
  );
  const returnBlock = bindingRpc.slice(bindingRpc.lastIndexOf("RETURN"));
  assert.doesNotMatch(returnBlock, /invoice_payload/);
});

test("only authenticated staff can execute the binding RPC", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.confirm_cash_payment_with_invoice_binding\(bigint, numeric\)[\s\S]*?FROM PUBLIC, anon, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.confirm_cash_payment_with_invoice_binding\(bigint, numeric\)[\s\S]*?TO authenticated/,
  );
  assert.match(
    bindingRpc,
    /public\.has_permission\(v_order\.branch_id, 'pos:confirm_payment'\)/,
  );
});

test("cash action passes the server-owned fallback buyer snapshot into the atomic binding RPC", () => {
  assert.match(
    paymentActions,
    /rpc\.rpc<CashPaymentResult>\(\s*"confirm_cash_payment_with_invoice_binding"/,
  );
  assert.match(
    paymentActions,
    /p_invoice_payload: POS_DEFAULT_INVOICE_PAYLOAD/,
  );
  assert.match(workerMigration, /p_invoice_payload jsonb/);
  assert.match(workerMigration, /private\.upsert_tax_invoice_issue_job/);
});

test("cash completion queues the worker instead of issuing HĐĐT from the action", () => {
  const orchestrator = paymentActions.slice(
    paymentActions.indexOf(
      "export async function confirmCashPaymentWithInvoice",
    ),
    paymentActions.indexOf("/* ─── fetchVietQrConfig"),
  );
  const paymentCall = orchestrator.indexOf("confirmCashPayment(");

  assert.ok(paymentCall >= 0);
  assert.match(orchestrator, /invoice: \{ status: "queued" \}/);
  assert.doesNotMatch(orchestrator, /createTaxInvoice\(/);
});

test("self-order snapshot remains the authoritative payload inside the RPC", () => {
  assert.match(
    workerMigration,
    /v_payload := COALESCE\(v_request_payload, v_payload\)/,
  );
  assert.match(workerMigration, /request\.payment_id = v_payment_id/);
});

test("staff payment request contract does not expose stored buyer PII", () => {
  const requestInterface =
    /export interface SelfOrderPendingPaymentRequest \{[\s\S]*?\n\}/.exec(
      staffActions,
    )?.[0];
  assert.ok(requestInterface);
  assert.doesNotMatch(requestInterface, /invoice|buyer|taxCode|address|email/i);
});

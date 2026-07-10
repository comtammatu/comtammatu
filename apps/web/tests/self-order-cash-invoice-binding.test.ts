import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const migration = read(
  "../../supabase/migrations/20260710032423_self_order_cash_invoice_binding.sql",
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

function functionBlock(source: string, name: string): string {
  const block = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ).exec(source)?.[0];
  assert.ok(block, `expected SQL function ${name}`);
  return block;
}

function asyncFunctionBlock(source: string, name: string): string {
  const block = new RegExp(`async function ${name}\\([\\s\\S]*?\\n\\}`).exec(
    source,
  )?.[0];
  assert.ok(block, `expected async function ${name}`);
  return block;
}

const bindingRpc = functionBlock(
  migration,
  "confirm_cash_payment_with_invoice_binding",
);
const resolveBoundPayload = asyncFunctionBlock(
  paymentActions,
  "resolveBoundCashCallInvoicePayload",
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

test("payment action reloads buyer data by exact bound request and payment", () => {
  assert.match(
    paymentActions,
    /rpc\.rpc<CashPaymentResult>\(\s*"confirm_cash_payment_with_invoice_binding"/,
  );
  assert.match(resolveBoundPayload, /\.eq\("id", parsedRequest\.data\)/);
  assert.match(
    resolveBoundPayload,
    /\.eq\("tenant_id", ctx\.claims\.tenant_id\)/,
  );
  assert.match(resolveBoundPayload, /\.eq\("branch_id", parsedBranch\.data\)/);
  assert.match(resolveBoundPayload, /\.eq\("order_id", parsedOrder\.data\)/);
  assert.match(
    resolveBoundPayload,
    /\.eq\("payment_id", parsedPayment\.data\)/,
  );
  assert.match(resolveBoundPayload, /\.eq\("method", "cash_call"\)/);
  assert.match(resolveBoundPayload, /\.eq\("status", "completed"\)/);
});

test("stored payload overrides the POS form only after a successful bound payment", () => {
  const orchestrator = paymentActions.slice(
    paymentActions.indexOf(
      "export async function confirmCashPaymentWithInvoice",
    ),
    paymentActions.indexOf("/* ─── fetchVietQrConfig"),
  );
  const paymentCall = orchestrator.indexOf("confirmCashPayment(");
  const boundLookup = orchestrator.indexOf(
    "resolveBoundCashCallInvoicePayload(",
  );
  const invoiceCall = orchestrator.indexOf("createTaxInvoice({");

  assert.ok(paymentCall >= 0);
  assert.ok(boundLookup > paymentCall);
  assert.ok(invoiceCall > boundLookup);
  assert.match(orchestrator, /let invoicePayload = posInvoicePayload/);
  assert.match(
    orchestrator,
    /selfOrderRequestId[\s\S]*?invoicePayload = await resolveBoundCashCallInvoicePayload/,
  );
});

test("a post-payment binding read failure stays invoice-fail-soft", () => {
  const orchestrator = paymentActions.slice(
    paymentActions.indexOf(
      "export async function confirmCashPaymentWithInvoice",
    ),
    paymentActions.indexOf("/* ─── fetchVietQrConfig"),
  );

  assert.match(
    orchestrator,
    /!invoicePayload\.success[\s\S]*?success: true,[\s\S]*?invoice: \{[\s\S]*?status: "failed"/,
  );
});

test("staff payment request contract does not expose stored buyer PII", () => {
  const requestInterface =
    /export interface SelfOrderPendingPaymentRequest \{[\s\S]*?\n\}/.exec(
      staffActions,
    )?.[0];
  assert.ok(requestInterface);
  assert.doesNotMatch(requestInterface, /invoice|buyer|taxCode|address|email/i);
});

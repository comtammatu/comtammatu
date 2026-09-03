import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractSqlFunction,
  readActiveMigrationSql,
  readSql,
} from "./_lib/active-sql.ts";

function read(path: string): string {
  return readSql(process.cwd(), path);
}

const activeSql = readActiveMigrationSql();
const preventLock = extractSqlFunction(
  activeSql,
  "public.prevent_order_amount_mutation_after_payment_code_exposed",
);
const refreshPending = extractSqlFunction(
  activeSql,
  "public.refresh_pending_vietqr_for_order",
);
const submit = extractSqlFunction(activeSql, "public.self_order_submit");
const accept = extractSqlFunction(
  activeSql,
  "public.self_order_accept_request",
);
const createPayment = extractSqlFunction(
  activeSql,
  "public.self_order_create_payment_request",
);
const snapshot = extractSqlFunction(
  activeSql,
  "public.self_order_get_snapshot",
);
const invariants = extractSqlFunction(
  activeSql,
  "public.self_order_enforce_payment_request_invariants",
);
const paymentActions = read(
  "app/(protected)/br/[branchId]/pos/payment-actions.ts",
);
const billSheet = read(
  "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
);
const selfOrderClient = read("app/q/[token]/self-order-client.tsx");
const selfOrderPaymentPanel = read(
  "app/q/[token]/self-order/payment-panel.tsx",
);
const posLock = read(
  "app/(protected)/br/[branchId]/pos/_lib/table-order-visual-state.ts",
);

test("order amount mutations refresh pending VietQR instead of locking", () => {
  assert.match(refreshPending, /CREATE OR REPLACE FUNCTION public\.refresh_pending_vietqr_for_order/);
  assert.match(refreshPending, /print_vietqr_emvco/);
  assert.match(refreshPending, /UPDATE public\.payments/);
  assert.match(refreshPending, /qr_payload_snapshot/);
  assert.doesNotMatch(preventLock, /v_money_changed OR v_cancelled_unpaid/);
  assert.match(preventLock, /v_cancelled_unpaid/);
  assert.match(
    activeSql,
    /CREATE TRIGGER trg_orders_refresh_pending_vietqr[\s\S]*AFTER UPDATE OF total_amount ON public\.orders/,
  );
});

test("self-order submit and accept keep the live VietQR and let it refresh", () => {
  assert.doesNotMatch(submit, /guest_added_items_auto_refresh/);
  assert.doesNotMatch(
    submit,
    /UPDATE public\.payments\s+SET status = 'failed'/,
  );
  assert.doesNotMatch(accept, /self_order_pending_payment_exists/);
  assert.doesNotMatch(accept, /self_order_active_payment_lock/);
});

test("self-order create and snapshot recover a pending VietQR instead of blocking", () => {
  assert.match(createPayment, /self_order_adopt_pending_vietqr/);
  assert.match(createPayment, /p_method = 'vietqr' AND v_active.method = 'vietqr'/);
  assert.match(createPayment, /recovered/);
  assert.match(snapshot, /self_order_pending_vietqr_public_payload/);
  assert.match(invariants, /vietqr_amount_refresh/);
});

test("payment-actions auto-refreshes VietQR when amount does not match order total", () => {
  assert.match(
    paymentActions,
    /const existingAmount = Number\(pendingBeforeProvider\.data\.qr_info\?\.amount\);/,
  );
  assert.match(
    paymentActions,
    /if \(existingAmount === amount && pendingBeforeProvider\.data\.qr_data\) \{/,
  );
});

test("bill-receipt-sheet detects stale QR amount and auto-refreshes VietQR", () => {
  assert.match(billSheet, /const isAmountStale =/);
  assert.match(
    billSheet,
    /Number\(pendingExtras\.qr_info\.amount\) !== Number\(order\.total_amount\)/,
  );
  assert.match(
    billSheet,
    /\/\/ Auto-refresh QR when order total changes while VietQR is selected/,
  );
});

test("self-order guest reopens a live VietQR and can keep paying", () => {
  assert.match(selfOrderClient, /hasLiveSelfOrderPayment/);
  assert.match(selfOrderClient, /useState\(\(\) =>\s*hasLiveSelfOrderPayment/);
  assert.match(selfOrderClient, /disabled=\{awaiting\}/);
  assert.doesNotMatch(selfOrderClient, /disabled=\{awaiting \|\| paymentPending\}/);
  assert.match(selfOrderPaymentPanel, /SELF_ORDER_VI\.cancelVietQr/);
  assert.match(posLock, /return false;/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = read(
  "../../supabase/migrations/20260815170000_vietqr_auto_refresh_and_self_order_unblock.sql",
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

test("migration defines create_remote_payment_intent with in-place amount update", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_remote_payment_intent/,
  );
  assert.match(migration, /UPDATE public\.payments\s+SET amount = p_amount/);
  assert.doesNotMatch(
    migration,
    /RAISE EXCEPTION 'payment_pending_amount_mismatch'/,
  );
});

test("migration defines self_order_submit with auto-cancelling of pending payment requests", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_submit/,
  );
  assert.match(
    migration,
    /UPDATE public\.self_order_payment_requests\s+SET status = 'cancelled'/,
  );
  assert.doesNotMatch(
    migration,
    /RAISE EXCEPTION 'self_order_pending_payment_exists'/,
  );
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

test("self-order guest client unblocks submit CTA and clears stale payment request on submit", () => {
  assert.match(selfOrderClient, /const ctaDisabled = false;/);
  assert.match(selfOrderClient, /setLocalPaymentRequest\(null\);/);
  assert.match(
    selfOrderPaymentPanel,
    /SELF_ORDER_VI\.cancelVietQr/,
  );
});

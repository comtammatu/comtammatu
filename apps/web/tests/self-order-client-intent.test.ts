import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildBatchIntentKey,
  buildPaymentIntentKey,
  clearClientIntent,
  resolveClientIntent,
} from "../lib/self-order/client-intent";
import type { SelfOrderCartItem } from "../lib/self-order/contracts";

const item: SelfOrderCartItem = {
  key: "cart-line-1",
  menu_item_id: 10,
  item_name: "Cơm tấm",
  quantity: 1,
  unit_price: 45_000,
  modifiers: [],
  sides: [],
};

test("one logical batch payload reuses one client operation id", () => {
  const key = buildBatchIntentKey({
    items: [item],
    customerNote: "  Ít cơm  ",
  });
  const sameKey = buildBatchIntentKey({
    customerNote: "Ít cơm",
    items: [{ ...item }],
  });
  assert.equal(key, sameKey);

  let generated = 0;
  const first = resolveClientIntent(null, key, () => `id-${++generated}`);
  const retry = resolveClientIntent(first, sameKey, () => `id-${++generated}`);
  assert.equal(retry.clientOpId, first.clientOpId);
  assert.equal(generated, 1);

  const changedKey = buildBatchIntentKey({
    items: [{ ...item, quantity: 2 }],
    customerNote: "Ít cơm",
  });
  const changed = resolveClientIntent(
    retry,
    changedKey,
    () => `id-${++generated}`,
  );
  assert.notEqual(changed.clientOpId, retry.clientOpId);
  assert.equal(generated, 2);
});

test("payment intent key is canonical and changes with payable truth", () => {
  const left = buildPaymentIntentKey({
    method: "vietqr",
    invoice: { buyerName: "Má Tư", buyerNotGetInvoice: false },
    orderNumber: "MT-1",
    totalAmount: 45_000,
  });
  const right = buildPaymentIntentKey({
    totalAmount: 45_000,
    orderNumber: "MT-1",
    invoice: { buyerNotGetInvoice: false, buyerName: "Má Tư" },
    method: "vietqr",
  });
  assert.equal(left, right);
  assert.notEqual(
    left,
    buildPaymentIntentKey({
      method: "vietqr",
      invoice: { buyerName: "Má Tư", buyerNotGetInvoice: false },
      orderNumber: "MT-1",
      totalAmount: 50_000,
    }),
  );
});

test("only the matching acknowledged intent is cleared", () => {
  const current = { key: "payload", clientOpId: "op-1" };
  assert.equal(clearClientIntent(current, "op-2"), current);
  assert.equal(clearClientIntent(current, "op-1"), null);
});

test("self-order client sends a stable intent without guest payment cancellation", () => {
  const client = readFileSync(
    new URL("../app/q/[token]/self-order-client.tsx", import.meta.url),
    "utf8",
  );
  const server = readFileSync(
    new URL("../lib/self-order/server.ts", import.meta.url),
    "utf8",
  );
  const batchRoute = readFileSync(
    new URL("../app/api/self-order/[token]/batches/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(client, /resolveClientIntent\(/);
  assert.match(client, /"batches",\s*intent,\s*submittedItems/);
  assert.doesNotMatch(client, /cancel-pending-payment-and-add/);
  assert.doesNotMatch(client, /confirm\(\{/);
  assert.match(client, /clientOpId: intent\.clientOpId/);
  assert.doesNotMatch(client, /clientOpId: newClientOpId\(\)/);
  assert.match(server, /self_order_idempotency_conflict/);
  assert.match(server, /code: "idempotency_conflict"/);
  assert.match(server, /self_order_retry/);
  assert.match(server, /code: "retry_required"/);
  assert.match(server, /mapSelfOrderDataFailure/);
  assert.match(
    batchRoute,
    /const snapshot =[\s\S]*getSelfOrderSnapshotV2\([\s\S]*getSelfOrderSnapshot\(token\)/,
  );
  assert.match(batchRoute, /clientOpId: parsed\.data\.clientOpId/);
  assert.match(batchRoute, /snapshot: authoritativeSnapshot/);
  assert.match(
    client,
    /acknowledgedClientOpId !== intent\.clientOpId[\s\S]*setSnapshot\(nextSnapshot as PublicSelfOrderSnapshot\)[\s\S]*clearClientIntent/,
  );
});

test("active cash and VietQR intents recover from snapshot and lock guest writes", () => {
  const client = readFileSync(
    new URL("../app/q/[token]/self-order-client.tsx", import.meta.url),
    "utf8",
  );
  const menu = readFileSync(
    new URL("../app/q/[token]/self-order/menu-panel.tsx", import.meta.url),
    "utf8",
  );
  const payment = readFileSync(
    new URL("../app/q/[token]/self-order/payment-panel.tsx", import.meta.url),
    "utf8",
  );
  const hooks = readFileSync(
    new URL("../app/q/[token]/self-order/hooks.ts", import.meta.url),
    "utf8",
  );

  assert.match(client, /normalizePaymentRequest\(\s*snapshot\.paymentRequest/);
  assert.match(client, /paymentRequest\?\.status === "cash_call"/);
  assert.match(client, /paymentRequest\?\.status === "vietqr_pending"/);
  assert.match(client, /function readPaymentAmount[\s\S]*candidate >= 0/);
  assert.match(client, /activePaymentRequest !== null/);
  assert.match(client, /disabled=\{activePaymentRequest !== null\}/);
  assert.match(
    client,
    /const refreshPaymentState = useCallback\([\s\S]*if \(refreshed\) \{[\s\S]*localPaymentSnapshotRef\.current = null;[\s\S]*setLocalPaymentRequest\(null\)/,
  );
  assert.match(
    client,
    /localPaymentSnapshotRef\.current === snapshot \? localPaymentRequest : null/,
  );
  assert.match(menu, /disabled=\{disabled\}/);
  assert.match(payment, /activePaymentRequest\.qrData/);
  assert.match(payment, /activeOrder\.status === "ready"/);
  assert.match(payment, /activeOrder\.status === "served"/);
  assert.match(payment, /SELF_ORDER_VI\.paymentCancelStaffRequired/);
  assert.match(hooks, /refreshGenerationRef/);
  assert.match(hooks, /refreshAbortRef\.current\?\.abort\(\)/);
  assert.match(hooks, /generation !== refreshGenerationRef\.current/);
  assert.match(hooks, /signal: controller\.signal/);
  assert.match(hooks, /status !== "SUBSCRIBED"/);
  assert.match(hooks, /visibilitychange/);
});

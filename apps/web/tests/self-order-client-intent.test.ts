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
    items: [{ ...item, key: "regenerated-ui-key" }],
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
  const submitRoute = readFileSync(
    new URL("../app/api/self-order/[token]/submit/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(client, /resolveClientIntent\(/);
  assert.match(client, /\/submit/);
  assert.doesNotMatch(client, /cancel-pending-payment-and-add/);
  assert.match(client, /clientOpId: intent\.clientOpId/);
  assert.doesNotMatch(client, /clientOpId: newClientOpId\(\)/);
  assert.match(server, /self_order_idempotency_conflict/);
  assert.match(server, /code: "idempotency_conflict"/);
  assert.match(server, /self_order_retry/);
  assert.match(server, /code: "retry_required"/);
  assert.match(
    submitRoute,
    /getSelfOrderSnapshot\(token, parsed\.data\.clientOpId\)/,
  );
  assert.match(submitRoute, /clientOpId: parsed\.data\.clientOpId/);
  assert.match(submitRoute, /snapshot: snapshot\.data/);
  assert.match(
    client,
    /acknowledgedClientOpId !== intent\.clientOpId[\s\S]*setSnapshot\(parsedSnapshot\.data\)[\s\S]*clearClientIntent/,
  );
});

test("active payment intents lock guest writes except MoMo checkout recovery", () => {
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

  assert.match(client, /normalizePaymentRequest\(\s*available\.paymentRequest/);
  assert.match(client, /snapshotPaymentRequest \?\? localPaymentRequest/);
  assert.match(client, /const recoverMomo =/);
  assert.match(client, /activePaymentRequest && !recoverMomo/);
  assert.match(client, /recover: true/);
  assert.match(
    client,
    /let paymentStatusInFlight = false[\s\S]*if \(paymentStatusInFlight\) return[\s\S]*finally \{[\s\S]*paymentStatusInFlight = false/,
  );
  assert.match(
    client,
    /payload\?\.status === "cancelled"[\s\S]*setPaymentStatusClientOpId\(null\)[\s\S]*refreshSnapshot\(\)/,
  );
  assert.match(
    client,
    /momo_checkout_retry_required[\s\S]*clearClientIntent\([\s\S]*requestClientOpId[\s\S]*refreshSnapshot/,
  );
  assert.match(
    client,
    /setLocalPaymentRequest\(paymentRequest\)[\s\S]*clearClientIntent\([\s\S]*requestClientOpId/,
  );
  assert.match(menu, /disabled=\{disabled\}/);
  assert.match(payment, /activePaymentRequest\.qrData/);
  assert.doesNotMatch(payment, /<NoteCallout|vietQrPendingDescription/);
  assert.match(hooks, /generationRef/);
  assert.match(hooks, /abortRef\.current\?\.abort\(\)/);
  assert.match(hooks, /generation !== generationRef\.current/);
  assert.match(hooks, /signal: controller\.signal/);
  assert.match(hooks, /fast \? 3_000 : 15_000/);
  assert.doesNotMatch(hooks, /createClient|\.channel\(/);
  assert.match(hooks, /visibilitychange/);
});

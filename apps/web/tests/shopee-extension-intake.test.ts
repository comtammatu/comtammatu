import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { test } from "node:test";

const source = (name: string) =>
  readFileSync(
    new URL(
      `../../../tools/shopeefood-pos-relay-extension/${name}`,
      import.meta.url,
    ),
    "utf8",
  );

function captureHarness() {
  const events: Array<{ type: string; data: { order?: { orderId: string } } }> =
    [];
  let payload: unknown;
  class Xhr {
    open() {}
    send() {}
  }
  const context = createContext({
    console: { log() {}, warn() {}, error() {} },
    URL,
    Request,
    document: {},
    XMLHttpRequest: Xhr,
    setInterval() {},
    window: {
      location: {
        href: "https://partner.shopee.vn/order/report-restaurant",
        origin: "https://partner.shopee.vn",
        reload() {},
      },
      addEventListener() {},
      postMessage: (event: (typeof events)[number]) => events.push(event),
      fetch: async () => ({
        ok: true,
        status: 200,
        clone: () => ({ json: async () => payload }),
      }),
    },
  });
  runInContext(source("injected.js"), context);
  return {
    events,
    async capture(
      value: unknown,
      url = "https://gmerchant.deliverynow.vn/api/order/detail",
    ) {
      payload = value;
      await context.window.fetch(url);
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
  };
}

const item = { name: "Sườn Cốt Lết", quantity: 2, price: 54000 };

test("Shopee capture rejects missing order identity and incomplete list entries", async () => {
  const harness = captureHarness();
  await harness.capture({
    data: { orders: [{ items: [item] }, { order_id: "order-91" }] },
  });
  assert.equal(
    harness.events.filter((event) => event.type === "ORDER_DETAIL").length,
    0,
  );
});

test("Shopee capture can offer the same order again until the durable relay confirms it", async () => {
  const harness = captureHarness();
  const detail = { data: { order: { order_id: "order-91", items: [item] } } };
  await harness.capture(detail);
  await harness.capture(detail);
  assert.equal(
    harness.events.filter((event) => event.type === "ORDER_DETAIL").length,
    2,
  );
});

test("Shopee capture ignores lookalike hosts and unrelated API responses", async () => {
  const harness = captureHarness();
  const detail = { data: { order: { order_id: "order-91", items: [item] } } };
  await harness.capture(
    detail,
    "https://partner.shopee.vn.attacker.example/api/order/detail",
  );
  await harness.capture(
    detail,
    "https://gmerchant.deliverynow.vn/api/store/basic",
  );
  assert.equal(
    harness.events.filter((event) => event.type === "ORDER_DETAIL").length,
    0,
  );
});

test("Shopee extension avoids reusing a static script across MAIN and ISOLATED worlds", () => {
  const manifest = JSON.parse(source("manifest.json")) as {
    content_scripts: Array<{ js: string[] }>;
  };
  const scripts = manifest.content_scripts.flatMap((entry) => entry.js);
  assert.equal(new Set(scripts).size, scripts.length);
});

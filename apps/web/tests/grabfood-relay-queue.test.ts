import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

interface ProjectedDiscountInfo {
  discountName?: string;
  discountType?: string;
  itemDiscountPriceDisplay?: string;
}

interface QueueItem {
  orderID: string;
  displayID: string;
  order: { orderID: string; displayID?: string; revision?: number };
  merchantId: string;
  branchId: number;
  backendUrl: string;
  relaySecret: string;
  attempts: number;
  nextRetryAt: number;
  lastError: string | null;
  isTerminal: boolean;
  createdAt: number;
}

interface QueueDecision {
  ok: boolean;
  error?: string;
  action?: "enqueued" | "existing" | "revived";
  queue: QueueItem[];
  item?: QueueItem;
}

interface GrabRelayQueueApi {
  enqueueOrRevive(
    queue: QueueItem[],
    order: QueueItem["order"],
    settings: {
      merchantId: string;
      branchId: number;
      backendUrl: string;
      relaySecret: string;
    },
    now: number,
  ): QueueDecision;
}

const queueSource = readFileSync(
  new URL(
    "../../../tools/grab-pos-relay-extension/relay-queue.js",
    import.meta.url,
  ),
  "utf8",
);
const queueContext: { GrabRelayQueue?: GrabRelayQueueApi } = {};
runInNewContext(queueSource, queueContext);
const queueApi = queueContext.GrabRelayQueue;
assert.ok(queueApi);

const settings = {
  merchantId: "5-C8DTE75GUGJ3JT",
  branchId: 3,
  backendUrl: "https://web.comtammatu.com",
  relaySecret: "test-secret",
};

test("Grab relay queue reopens a terminal order with fresh provider data", () => {
  const existing: QueueItem = {
    orderID: "grab-order-1",
    displayID: "GF-001",
    order: { orderID: "grab-order-1", displayID: "GF-001", revision: 1 },
    merchantId: settings.merchantId,
    branchId: settings.branchId,
    backendUrl: settings.backendUrl,
    relaySecret: settings.relaySecret,
    attempts: 1,
    nextRetryAt: 100,
    lastError: "Dữ liệu yêu cầu không hợp lệ",
    isTerminal: true,
    createdAt: 50,
  };

  const result = queueApi.enqueueOrRevive(
    [existing],
    { orderID: "grab-order-1", displayID: "GF-001", revision: 2 },
    settings,
    200,
  );

  assert.equal(result.ok, true);
  assert.equal(result.action, "revived");
  assert.equal(result.queue.length, 1);
  assert.equal(result.item?.order.revision, 2);
  assert.equal(result.item?.attempts, 0);
  assert.equal(result.item?.nextRetryAt, 200);
  assert.equal(result.item?.lastError, null);
  assert.equal(result.item?.isTerminal, false);
  assert.equal(result.item?.createdAt, 50);
});

test("Grab relay queue leaves an active duplicate unchanged", () => {
  const initial = queueApi.enqueueOrRevive(
    [],
    { orderID: "grab-order-2", displayID: "GF-002", revision: 1 },
    settings,
    300,
  );
  const duplicate = queueApi.enqueueOrRevive(
    initial.queue,
    { orderID: "grab-order-2", displayID: "GF-002", revision: 2 },
    settings,
    400,
  );

  assert.equal(duplicate.action, "existing");
  assert.equal(duplicate.queue.length, 1);
  assert.equal(duplicate.item?.order.revision, 1);
  assert.equal(duplicate.item?.nextRetryAt, 300);
});

test("Grab relay queue fails closed when branch configuration is missing", () => {
  const result = queueApi.enqueueOrRevive(
    [],
    { orderID: "grab-order-unscoped", displayID: "GF-UNSCOPED" },
    { ...settings, branchId: Number.NaN },
    500,
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "Missing branch configuration");
  assert.deepEqual(result.queue, []);
});

test("Grab relay projector does not forward raw discount objects", () => {
  const projectorSource = readFileSync(
    new URL(
      "../../../tools/grab-pos-relay-extension/injected.js",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    projectorSource,
    /discountInfo: projectDiscountInfo\(i\.discountInfo\)/,
  );
  assert.match(
    projectorSource,
    /orderLevelDiscounts: projectOrderDiscounts\(rawOrderLevelDiscounts\)/,
  );
  assert.doesNotMatch(projectorSource, /discountInfo: i\.discountInfo/);
});

test("Grab relay projector preserves array-shaped item promotions", () => {
  const projectorSource = readFileSync(
    new URL(
      "../../../tools/grab-pos-relay-extension/injected.js",
      import.meta.url,
    ),
    "utf8",
  );
  const start = projectorSource.indexOf("function optionalString");
  const end = projectorSource.indexOf("function projectOrderDiscount", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const projectDiscountInfo = Function(
    `"use strict"; ${projectorSource.slice(start, end)}; return projectDiscountInfo;`,
  )() as (value: unknown) => ProjectedDiscountInfo[] | undefined;

  assert.deepEqual(
    projectDiscountInfo([
      {
        discountName: "Tặng món theo điều kiện",
        discountType: "freeItem",
        itemDiscountPriceDisplay: "10.000",
        providerPrivateField: "must-not-leak",
      },
    ]),
    [
      {
        discountName: "Tặng món theo điều kiện",
        discountType: "freeItem",
        itemDiscountPriceDisplay: "10.000",
        itemDiscountPriceFloat: undefined,
        itemDiscountPriceInMin: undefined,
        discountAmountDisplay: undefined,
        discountAmountFloat: undefined,
      },
    ],
  );
});

test("Grab relay worker identifies its contract version and displays the stored POS total", () => {
  const backgroundSource = readFileSync(
    new URL(
      "../../../tools/grab-pos-relay-extension/background.js",
      import.meta.url,
    ),
    "utf8",
  );
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        "../../../tools/grab-pos-relay-extension/manifest.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { version?: string };

  assert.equal(manifest.version, "1.1.11");
  assert.match(backgroundSource, /relay_version: RELAY_VERSION/);
  assert.match(backgroundSource, /responseJson\.total_amount/);
  assert.match(backgroundSource, /res\.status === 426/);
});

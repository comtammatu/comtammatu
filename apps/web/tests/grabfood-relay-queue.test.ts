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
  action?: "enqueued" | "existing" | "revived" | "updated";
  queue: QueueItem[];
  item?: QueueItem;
}

interface DispatchJob {
  orderID: string;
  lane: "live" | "retry";
}

interface GrabRelayQueueApi {
  enqueueOrRevive(
    queue: QueueItem[],
    order: QueueItem["order"] & { contentFingerprint?: string },
    settings: {
      merchantId: string;
      branchId: number;
      backendUrl: string;
      relaySecret: string;
    },
    now: number,
  ): QueueDecision;
  contentFingerprint(order: unknown): string;
  selectDispatchJobs(
    queue: QueueItem[],
    now: number,
    inFlight: Iterable<string>,
    maxSlots?: number,
  ): DispatchJob[];
  mergeQueueByOrderId(
    persisted: QueueItem[],
    local: QueueItem[],
  ): QueueItem[];
  applyDispatchOutcome(
    item: QueueItem,
    outcome: {
      ok: boolean;
      status?: number;
      error?: string;
      now: number;
    },
  ): { keep: boolean; item: QueueItem };
  toolbarBadgeText(
    queue: Array<Pick<QueueItem, "isTerminal">>,
    health?: { failedIds?: string[] } | null,
  ): string;
  isLeaderTab(
    leader: { tabId?: number; heartbeatAt?: number } | null,
    tabId: number,
    now: number,
    stealMs?: number,
  ): boolean;
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
  ) as {
    version?: string;
    permissions?: string[];
    host_permissions?: string[];
    optional_host_permissions?: string[];
  };

  assert.equal(manifest.version, "1.2.0");
  assert.ok(manifest.permissions?.includes("idle"));
  assert.ok(manifest.host_permissions?.includes("https://merchant.grab.com/*"));
  assert.ok(!manifest.host_permissions?.includes("<all_urls>"));
  assert.ok(manifest.optional_host_permissions?.includes("http://*/*"));
  assert.ok(manifest.optional_host_permissions?.includes("https://*/*"));
  assert.match(backgroundSource, /relay_version: RELAY_VERSION/);
  assert.match(backgroundSource, /responseJson\.total_amount/);
  assert.match(queueSource, /TERMINAL_HTTP = new Set\(\[400, 401, 403, 422, 426\]\)/);
  assert.match(backgroundSource, /AbortController/);
  assert.match(backgroundSource, /selectDispatchJobs/);
  assert.doesNotMatch(backgroundSource, /isProcessingQueue/);
  assert.match(backgroundSource, /chrome\.action\.setBadgeText/);
  assert.match(backgroundSource, /chrome\.idle\.onStateChanged/);
});

test("Grab relay queue still enqueues items that have no fingerprint", () => {
  const result = queueApi.enqueueOrRevive(
    [],
    { orderID: "grab-order-legacy", displayID: "GF-LEGACY" },
    settings,
    600,
  );

  assert.equal(result.ok, true);
  assert.equal(result.action, "enqueued");
  assert.equal(result.item?.orderID, "grab-order-legacy");
});

test("Grab relay queue replaces an active item when the fingerprint changes", () => {
  const first = queueApi.enqueueOrRevive(
    [],
    {
      orderID: "grab-order-3",
      displayID: "GF-003",
      contentFingerprint: "fp-a",
    },
    settings,
    700,
  );
  const updated = queueApi.enqueueOrRevive(
    first.queue,
    {
      orderID: "grab-order-3",
      displayID: "GF-003",
      contentFingerprint: "fp-b",
    },
    settings,
    800,
  );

  assert.equal(updated.action, "updated");
  assert.equal(updated.item?.attempts, 0);
  assert.equal(updated.item?.isTerminal, false);
  assert.equal(updated.queue.length, 1);
});

test("Grab relay live lane still dispatches while an earlier retry is waiting", () => {
  const now = 10_000;
  const waitingRetry: QueueItem = {
    orderID: "order-a",
    displayID: "GF-A",
    order: { orderID: "order-a" },
    merchantId: settings.merchantId,
    branchId: settings.branchId,
    backendUrl: settings.backendUrl,
    relaySecret: settings.relaySecret,
    attempts: 1,
    nextRetryAt: now + 30_000,
    lastError: "timeout",
    isTerminal: false,
    createdAt: 1,
  };
  const readyLive: QueueItem = {
    orderID: "order-b",
    displayID: "GF-B",
    order: { orderID: "order-b" },
    merchantId: settings.merchantId,
    branchId: settings.branchId,
    backendUrl: settings.backendUrl,
    relaySecret: settings.relaySecret,
    attempts: 0,
    nextRetryAt: now,
    lastError: null,
    isTerminal: false,
    createdAt: 2,
  };

  const jobs = queueApi.selectDispatchJobs(
    [waitingRetry, readyLive],
    now,
    [],
    3,
  );

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.orderID, "order-b");
  assert.equal(jobs[0]?.lane, "live");
});

test("Grab relay dispatch never opens two jobs for the same order or more than three slots", () => {
  const now = 20_000;
  const items = [1, 2, 3, 4].map((index) => ({
    orderID: `order-${index}`,
    displayID: `GF-${index}`,
    order: { orderID: `order-${index}` },
    merchantId: settings.merchantId,
    branchId: settings.branchId,
    backendUrl: settings.backendUrl,
    relaySecret: settings.relaySecret,
    attempts: 0,
    nextRetryAt: now,
    lastError: null,
    isTerminal: false,
    createdAt: index,
  })) satisfies QueueItem[];
  items[0] = { ...items[0]!, orderID: "order-1" };

  const jobs = queueApi.selectDispatchJobs(items, now, ["order-1"], 3);
  assert.equal(jobs.length, 3);
  assert.equal(jobs.some((job) => job.orderID === "order-1"), false);
  assert.equal(jobs.map((job) => job.orderID).join(","), "order-2,order-3,order-4");
});

test("Grab relay retry items only take a slot when the live lane is empty", () => {
  const now = 30_000;
  const live: QueueItem = {
    orderID: "live-1",
    displayID: "GF-LIVE",
    order: { orderID: "live-1" },
    merchantId: settings.merchantId,
    branchId: settings.branchId,
    backendUrl: settings.backendUrl,
    relaySecret: settings.relaySecret,
    attempts: 0,
    nextRetryAt: now,
    lastError: null,
    isTerminal: false,
    createdAt: 1,
  };
  const dueRetry: QueueItem = {
    orderID: "retry-1",
    displayID: "GF-RETRY",
    order: { orderID: "retry-1" },
    merchantId: settings.merchantId,
    branchId: settings.branchId,
    backendUrl: settings.backendUrl,
    relaySecret: settings.relaySecret,
    attempts: 2,
    nextRetryAt: now,
    lastError: "429",
    isTerminal: false,
    createdAt: 1,
  };

  const liveOnly = queueApi.selectDispatchJobs([live, dueRetry], now, [], 1);
  assert.equal(liveOnly[0]?.orderID, "live-1");
  assert.equal(liveOnly[0]?.lane, "live");
  const retryOnly = queueApi.selectDispatchJobs([dueRetry], now, [], 1);
  assert.equal(retryOnly[0]?.orderID, "retry-1");
  assert.equal(retryOnly[0]?.lane, "retry");
});

test("Grab relay toolbar badge counts terminal queue items and failed item syncs", () => {
  assert.equal(queueApi.toolbarBadgeText([], { failedIds: [] }), "");
  assert.equal(
    queueApi.toolbarBadgeText(
      [{ isTerminal: true }, { isTerminal: false }],
      { failedIds: ["VNITE1", "VNITE2"] },
    ),
    "3",
  );
});

test("Grab relay leader lock expires after the steal window", () => {
  assert.equal(
    queueApi.isLeaderTab({ tabId: 11, heartbeatAt: 1000 }, 22, 1000 + 14_999, 15_000),
    false,
  );
  assert.equal(
    queueApi.isLeaderTab({ tabId: 11, heartbeatAt: 1000 }, 22, 1000 + 15_001, 15_000),
    true,
  );
  assert.equal(
    queueApi.isLeaderTab({ tabId: 11, heartbeatAt: 1000 }, 11, 2000, 15_000),
    true,
  );
});

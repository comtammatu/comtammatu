import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const contentSource = readFileSync(
  `${repositoryRoot}/tools/grab-pos-relay-extension/content.js`,
  "utf8",
);
const injectedSource = readFileSync(
  `${repositoryRoot}/tools/grab-pos-relay-extension/injected.js`,
  "utf8",
);
const itemStatusRouteSource = readFileSync(
  `${repositoryRoot}/apps/web/app/api/webhooks/grabfood/item-status/route.ts`,
  "utf8",
);

function sourceBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} must exist`);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `${end} must exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

function loadNormalizeStockPayload(): (currentStock: unknown) => unknown {
  const functionSource = sourceBlock(
    contentSource,
    "function normalizeStockPayload",
    "function queueItemSync",
  );
  return Function(
    `"use strict"; ${functionSource}; return normalizeStockPayload;`,
  )() as (currentStock: unknown) => unknown;
}

function loadNormalizeGrabIds(): (
  value: unknown,
  fallback: unknown,
  prefix: string,
) => string[] {
  const functionSource = sourceBlock(
    contentSource,
    "function normalizeGrabIds",
    "// Poll POS Backend",
  );
  return Function(
    `"use strict"; ${functionSource}; return normalizeGrabIds;`,
  )() as (value: unknown, fallback: unknown, prefix: string) => string[];
}

function loadGetVietnamBusinessDateKey(): (value: Date) => string {
  const functionSource = sourceBlock(
    contentSource,
    "const VIETNAM_BUSINESS_DATE_FORMATTER",
    "// Cache item and modifier state independently",
  );
  return Function(
    `"use strict"; ${functionSource}; return getVietnamBusinessDateKey;`,
  )() as (value: Date) => string;
}

function loadShouldSyncAvailabilityStatus(): (
  currentStatus: string,
  previousStatus: string | undefined,
  forceAll: boolean,
  reconcileTodayStatuses: boolean,
) => boolean {
  const functionSource = sourceBlock(
    contentSource,
    "function shouldSyncAvailabilityStatus",
    "function shouldFlushStockImmediately",
  );
  return Function(
    `"use strict"; ${functionSource}; return shouldSyncAvailabilityStatus;`,
  )() as (
    currentStatus: string,
    previousStatus: string | undefined,
    forceAll: boolean,
    reconcileTodayStatuses: boolean,
  ) => boolean;
}

function loadShouldFlushStockImmediately(): (
  currentStock: number,
  previousStockSignature: string | undefined,
  forceAll: boolean,
  statusChanged: boolean,
) => boolean {
  const functionSource = sourceBlock(
    contentSource,
    "function shouldFlushStockImmediately",
    "function normalizeStockPayload",
  );
  return Function(
    `"use strict"; const LOW_STOCK_IMMEDIATE_THRESHOLD = 3; ${functionSource}; return shouldFlushStockImmediately;`,
  )() as (
    currentStock: number,
    previousStockSignature: string | undefined,
    forceAll: boolean,
    statusChanged: boolean,
  ) => boolean;
}

function loadGetPendingStockUpdate(): (
  existing: { currentStock: number; signature: string; dueAt: number } | undefined,
  stockPayload: { currentStock: number; signature: string },
  immediate: boolean,
  now: number,
) => { currentStock: number; signature: string; dueAt: number } {
  const functionSource = sourceBlock(
    contentSource,
    "function getPendingStockUpdate",
    "function stageStockUpdate",
  );
  return Function(
    `"use strict"; const STOCK_FLUSH_DELAY_MS = 5 * 60 * 1000; ${functionSource}; return getPendingStockUpdate;`,
  )() as (
    existing: { currentStock: number; signature: string; dueAt: number } | undefined,
    stockPayload: { currentStock: number; signature: string },
    immediate: boolean,
    now: number,
  ) => { currentStock: number; signature: string; dueAt: number };
}

test("Grab item status sync matches the portal mutation contract", () => {
  const statusMutation = sourceBlock(
    injectedSource,
    "async function setGrabItemAvailableStatus",
    "// API Call: Sync Stock / Daily Limit",
  );

  assert.match(
    statusMutation,
    /food\/merchant\/v1\/items\/available-status[\s\S]*?method: 'PUT'/,
  );
  assert.match(statusMutation, /itemIDs: \[itemId\]/);
  assert.match(statusMutation, /availableStatus: statusCode/);
  assert.doesNotMatch(statusMutation, /\bitems:\s*\[/);
  assert.doesNotMatch(statusMutation, /\bavailableAt:/);
  assert.match(statusMutation, /error: 'Invalid available status'/);
});

test("Grab modifier status sync matches the observed portal mutation contract", () => {
  const modifierMutation = sourceBlock(
    injectedSource,
    "async function setGrabModifierAvailableStatus",
    "// API Call: Sync Stock / Daily Limit",
  );

  assert.match(modifierMutation, /itemId\.startsWith\('VNMOD'\)/);
  assert.match(
    modifierMutation,
    /food\/merchant\/v2\/modifiers\/available[\s\S]*?method: 'PUT'/,
  );
  assert.match(modifierMutation, /modifierIDs: \[itemId\]/);
  assert.match(modifierMutation, /availableStatus: statusCode/);
  assert.match(modifierMutation, /SYNC_MODIFIER_STATUS_RESULT/);
  assert.doesNotMatch(modifierMutation, /currentStock|enableIms|maxStock/);
});

test("Grab status backend keeps item and modifier availability contracts distinct", () => {
  assert.match(itemStatusRouteSource, /grab_item_ids:/);
  assert.match(itemStatusRouteSource, /grab_modifier_ids:/);
  assert.match(itemStatusRouteSource, /grabId\.startsWith\("VNMOD"\)/);
  assert.match(
    itemStatusRouteSource,
    /if \(row\.is_disabled\)[\s\S]*?itemAvailableStatus = 3/,
  );
  assert.match(
    itemStatusRouteSource,
    /else if \(row\.available_to_sell === 0\)[\s\S]*?itemAvailableStatus = 2/,
  );
  assert.match(
    itemStatusRouteSource,
    /row\.is_disabled\s*\|\|\s*row\.available_to_sell === 0[\s\S]*?modifierAvailableStatus = 2/,
  );
  assert.match(itemStatusRouteSource, /item_available_status: itemAvailableStatus/);
  assert.match(
    itemStatusRouteSource,
    /modifier_available_status: modifierAvailableStatus/,
  );
});

test("Grab relay queues modifier availability separately from item stock", () => {
  assert.match(contentSource, /item\.grab_modifier_ids/);
  assert.match(contentSource, /SET_MODIFIER_AVAILABLE_STATUS/);
  assert.match(contentSource, /SYNC_MODIFIER_STATUS_RESULT/);
  assert.match(contentSource, /modifier-status/);
  assert.doesNotMatch(
    contentSource,
    /SET_ITEM_STOCK[\s\S]{0,300}grab_modifier_ids/,
  );
  assert.match(contentSource, /item\.item_available_status \?\? item\.available_status/);
  assert.match(contentSource, /item\.modifier_available_status/);
  assert.match(
    contentSource,
    /'SET_MODIFIER_AVAILABLE_STATUS'[\s\S]*?availableStatus: modifierAvailableStatus/,
  );
});

test("Grab relay allowlists, deduplicates, and backfills availability target IDs", () => {
  const normalizeGrabIds = loadNormalizeGrabIds();

  assert.deepEqual(
    normalizeGrabIds(
      [
        "VNMOD20260819110119033709",
        "VNITE20260818044418061788",
        "VNMOD20260819110119033709",
        "invalid",
      ],
      null,
      "VNMOD",
    ),
    ["VNMOD20260819110119033709"],
  );
  assert.deepEqual(
    normalizeGrabIds(undefined, "VNITE20260818044418061788", "VNITE"),
    ["VNITE20260818044418061788"],
  );
});

test("Grab day rollover reconciles today's availability without resending all stock", () => {
  const getVietnamBusinessDateKey = loadGetVietnamBusinessDateKey();
  const shouldSyncAvailabilityStatus = loadShouldSyncAvailabilityStatus();
  const pollSource = sourceBlock(
    contentSource,
    "async function pollPosItemStatus",
    "// Listen to messages from popup",
  );

  assert.equal(
    getVietnamBusinessDateKey(new Date("2026-08-29T16:59:59.999Z")),
    "2026-08-29",
  );
  assert.equal(
    getVietnamBusinessDateKey(new Date("2026-08-29T17:00:00.000Z")),
    "2026-08-30",
  );
  assert.equal(
    shouldSyncAvailabilityStatus(
      "UNAVAILABLE_TODAY",
      "UNAVAILABLE_TODAY",
      false,
      true,
    ),
    true,
  );
  assert.equal(
    shouldSyncAvailabilityStatus("AVAILABLE", "AVAILABLE", false, true),
    false,
  );
  assert.doesNotMatch(pollSource, /forceAll = true/);
  assert.match(pollSource, /reconcileTodayStatuses/);
  assert.doesNotMatch(pollSource, /refreshItemStatusBusinessDate[\s\S]{0,120}itemStatusCache\.clear/);
});

test("Grab relay persists confirmed and queued item sync state by backend and branch", () => {
  assert.match(contentSource, /const ITEM_SYNC_STATE_STORAGE_KEY = 'grabItemSyncStateV1'/);
  assert.match(contentSource, /function hydrateItemSyncState/);
  assert.match(contentSource, /function persistItemSyncState/);
  assert.match(contentSource, /function ensureItemSyncScope/);
  assert.match(contentSource, /scopeKey: itemSyncScopeKey/);
  assert.match(contentSource, /pendingStockUpdates/);

  const manualSyncSource = sourceBlock(
    contentSource,
    "// Listen to messages from popup",
    "// Listen to messages from injected.js",
  );
  assert.match(manualSyncSource, /pollPosItemStatus\(true\)/);
  assert.doesNotMatch(manualSyncSource, /itemStatusCache\.clear/);
});

test("Grab relay coalesces normal stock changes for five minutes", () => {
  const getPendingStockUpdate = loadGetPendingStockUpdate();

  assert.match(contentSource, /const STOCK_FLUSH_DELAY_MS = 5 \* 60 \* 1000/);
  assert.match(contentSource, /const ITEM_STATUS_POLL_INTERVAL_MS = 30 \* 1000/);
  assert.match(contentSource, /const pendingStockUpdates = new Map\(\)/);
  assert.match(contentSource, /function stageStockUpdate/);
  assert.match(contentSource, /function schedulePendingStockFlush/);
  assert.match(contentSource, /setTimeout\(flushPendingStockUpdates/);
  assert.match(
    contentSource,
    /setInterval\(\(\) => pollPosItemStatus\(false\), ITEM_STATUS_POLL_INTERVAL_MS\)/,
  );
  assert.doesNotMatch(contentSource, /pollPosItemStatus\(false\), 6000/);

  assert.deepEqual(
    getPendingStockUpdate(
      { currentStock: 10, signature: "enabled:10", dueAt: 400_000 },
      { currentStock: 9, signature: "enabled:9" },
      false,
      200_000,
    ),
    { currentStock: 9, signature: "enabled:9", dueAt: 400_000 },
  );
  assert.deepEqual(
    getPendingStockUpdate(
      { currentStock: 9, signature: "enabled:9", dueAt: 400_000 },
      { currentStock: 3, signature: "enabled:3" },
      true,
      250_000,
    ),
    { currentStock: 3, signature: "enabled:3", dueAt: 250_000 },
  );
  assert.deepEqual(
    getPendingStockUpdate(
      undefined,
      { currentStock: 8, signature: "enabled:8" },
      false,
      100_000,
    ),
    { currentStock: 8, signature: "enabled:8", dueAt: 400_000 },
  );
});

test("Grab relay sends first, low-stock, and availability-transition stock immediately", () => {
  const shouldFlushStockImmediately = loadShouldFlushStockImmediately();

  assert.equal(shouldFlushStockImmediately(20, undefined, false, false), true);
  assert.equal(
    shouldFlushStockImmediately(20, "enabled:21", true, false),
    true,
  );
  assert.equal(
    shouldFlushStockImmediately(20, "enabled:21", false, true),
    true,
  );
  assert.equal(
    shouldFlushStockImmediately(3, "enabled:4", false, false),
    true,
  );
  assert.equal(
    shouldFlushStockImmediately(4, "enabled:5", false, false),
    false,
  );
});

test("Grab item stock sync matches the portal IMS mutation contract", () => {
  const stockMutation = sourceBlock(
    injectedSource,
    "async function setGrabItemStock",
    "// Intercept XMLHttpRequest",
  );

  assert.match(
    stockMutation,
    /items\/\$\{itemId\}\/upsert-item-stock`[\s\S]*?method: 'POST'/,
  );
  for (const bodyField of [
    "enableIms: true",
    "currentStock: stockVal",
    "enableRestock: false",
    "restockSetting: null",
  ]) {
    assert.ok(stockMutation.includes(bodyField), `missing ${bodyField}`);
  }
  assert.doesNotMatch(stockMutation, /\bmaxStock\b/);
  assert.match(stockMutation, /Number\.isInteger\(currentStock\)/);
  assert.match(stockMutation, /currentStock < 1 \|\| currentStock > 9999/);
});

test("zero and invalid stock never reach the Grab stock mutation", () => {
  const stockRouting = sourceBlock(
    contentSource,
    "function normalizeStockPayload",
    "// Listen to messages from popup",
  );

  assert.match(
    stockRouting,
    /currentStock === 0[\s\S]*kind: 'status-only'/,
  );
  assert.match(
    stockRouting,
    /!Number\.isInteger\(currentStock\) \|\| currentStock < 1 \|\| currentStock > 9999[\s\S]*kind: 'invalid'/,
  );
  assert.match(
    stockRouting,
    /stockPayload\.kind === 'status-only'[\s\S]*continue/,
  );
  assert.match(
    stockRouting,
    /stockPayload\.kind === 'invalid'[\s\S]*continue/,
  );
  assert.doesNotMatch(stockRouting, /rawMaxStock|stockPayload\.maxStock/);
});

test("stock normalization enforces the Portal boundary values", () => {
  const normalizeStockPayload = loadNormalizeStockPayload();

  assert.deepEqual(normalizeStockPayload(0), { kind: "status-only" });
  assert.deepEqual(normalizeStockPayload(1), {
    kind: "stock",
    currentStock: 1,
    signature: "enabled:1",
  });
  assert.deepEqual(normalizeStockPayload(9999), {
    kind: "stock",
    currentStock: 9999,
    signature: "enabled:9999",
  });
  for (const unmanagedStock of [null, undefined]) {
    assert.deepEqual(normalizeStockPayload(unmanagedStock), {
      kind: "not-managed",
    });
  }
  for (const invalidStock of [-1, 1.5, 10000]) {
    assert.deepEqual(normalizeStockPayload(invalidStock), { kind: "invalid" });
  }
});

test("Grab mutation headers retain only portal authentication context", () => {
  assert.match(
    injectedSource,
    /const CAPTURED_HEADER_ALLOWLIST = \[[\s\S]*'authorization'[\s\S]*'x-csrf-token'[\s\S]*'x-client-id'[\s\S]*'x-grabkit-clientid'[\s\S]*\]/,
  );
  assert.match(
    injectedSource,
    /nextHeaders\.authorization \|\| nextHeaders\['x-csrf-token'\]/,
  );
  assert.match(injectedSource, /'x-client-id': 'GrabMerchant-Portal'/);
  assert.match(injectedSource, /'x-grabkit-clientid': 'grabmerchant-portal'/);
});

test("Grab item mutations are serialized, deduplicated, and retry throttled", () => {
  assert.match(injectedSource, /let itemSyncTail = Promise\.resolve\(\)/);
  assert.match(injectedSource, /response\.status === 429/);
  assert.match(injectedSource, /response\.headers\.get\('retry-after'\)/);
  assert.match(contentSource, /const pendingItemSyncs = new Map\(\)/);
  assert.match(contentSource, /if \(pendingItemSyncs\.has\(key\)\) return false/);
});

test("valid stock has a stable bounded cache signature", () => {
  assert.match(contentSource, /signature: `enabled:\$\{currentStock\}`/);
  assert.match(contentSource, /prev\.stockSignature !== stockPayload\.signature/);
  assert.match(contentSource, /stockSignature: pending\?\.signature \|\| data\.stockSignature/);
});

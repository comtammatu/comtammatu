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

test("Grab item status sync matches the portal mutation contract", () => {
  assert.match(
    injectedSource,
    /food\/merchant\/v1\/items\/available-status[\s\S]*?method: 'PUT'/,
  );
  assert.match(injectedSource, /itemID: itemId/);
  assert.match(injectedSource, /availableStatus: statusCode/);
  assert.match(injectedSource, /availableAt: availableAt/);
  assert.match(injectedSource, /error: 'Invalid available status'/);
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

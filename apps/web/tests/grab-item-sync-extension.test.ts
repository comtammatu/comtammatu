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
  assert.match(
    injectedSource,
    /items\/\$\{itemId\}\/upsert-item-stock`[\s\S]*?method: 'POST'/,
  );
  for (const bodyField of [
    "enableIms: enableIms",
    "currentStock: stockVal",
    "maxStock: maxStockVal",
    "enableRestock: false",
    "restockSetting: null",
  ]) {
    assert.ok(injectedSource.includes(bodyField), `missing ${bodyField}`);
  }
  assert.match(injectedSource, /Number\.isFinite\(currentStock\)/);
  assert.match(injectedSource, /Math\.trunc\(currentStock\)/);
});

test("Grab item mutations are serialized, deduplicated, and retry throttled", () => {
  assert.match(injectedSource, /let itemSyncTail = Promise\.resolve\(\)/);
  assert.match(injectedSource, /response\.status === 429/);
  assert.match(injectedSource, /response\.headers\.get\('retry-after'\)/);
  assert.match(contentSource, /const pendingItemSyncs = new Map\(\)/);
  assert.match(contentSource, /if \(pendingItemSyncs\.has\(key\)\) return false/);
});

test("unlimited stock has a stable disabled cache signature", () => {
  assert.match(
    contentSource,
    /if \(!Number\.isFinite\(currentStock\)\)[\s\S]*?currentStock: null,[\s\S]*?maxStock: -1,[\s\S]*?signature: 'disabled'/,
  );
  assert.match(contentSource, /prev\.stockSignature !== stockPayload\.signature/);
  assert.match(contentSource, /stockSignature: pending\?\.signature \|\| data\.stockSignature/);
});

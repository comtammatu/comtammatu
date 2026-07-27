import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const stockClientSource = readWeb(
  "app/(protected)/inventory/stock/stock-client.tsx",
);
const stockModelSource = readWeb("lib/inventory/stock-on-hand-model.ts");
const branchStockClientSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
);

test("inventory stock status and category filters have one control source", () => {
  assert.doesNotMatch(stockClientSource, /const categoryColumnHeader =/);
  assert.doesNotMatch(stockClientSource, /const stockColumnHeader =/);
  assert.match(
    stockClientSource,
    /header: stockCopy\.filters\.categoryPlaceholder/,
  );
  assert.match(stockClientSource, /header: stockCopy\.table\.stock/);
  assert.match(
    stockClientSource,
    /flex min-w-0 flex-1 flex-wrap items-center gap-2/,
  );
  assert.match(stockClientSource, /aria-pressed=\{stockFilter === "low"\}/);
  assert.doesNotMatch(stockClientSource, /stockCopy\.metrics\.pending/);
  assert.doesNotMatch(stockClientSource, /pendingWorkCount/);
});

test("inventory stock low filter matches the under-threshold predicate", () => {
  assert.match(stockModelSource, /export function isStockReorderRisk/);
  assert.match(
    stockModelSource,
    /result = result\.filter\(isStockReorderRisk\);/,
  );
});

test("branch stock facets share one model and stay touch-native", () => {
  assert.match(branchStockClientSource, /filterStockOnHandIngredients/);
  assert.match(branchStockClientSource, /getStockOnHandCategories/);
  assert.match(branchStockClientSource, /value=\{category\}/);
  assert.match(branchStockClientSource, /onValueChange=\{setCategory\}/);
  assert.match(branchStockClientSource, /value=\{status\}/);
  assert.doesNotMatch(branchStockClientSource, /value=\{location\}/);
  assert.equal(
    (branchStockClientSource.match(/<SelectTrigger size="touch"/g) ?? [])
      .length,
    2,
  );
  assert.doesNotMatch(branchStockClientSource, /StockMobileGrid|DataTable/);
  assert.doesNotMatch(branchStockClientSource, /overflow-x-auto/);
});

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
    /const STOCK_COMPACT_QUERY = "\(max-width: 1279px\)"/,
  );
  assert.match(
    stockClientSource,
    /meta=\{!isCompactLayout \? workSignalCluster : undefined\}/,
  );
  assert.match(
    stockClientSource,
    /filters=\{!isCompactLayout \? filterControls : undefined\}/,
  );
  assert.doesNotMatch(stockClientSource, /\bbulk=\{/);
  assert.equal(
    (stockClientSource.match(/<AppPage width="xwide" density="compact" scroll>/g) ?? [])
      .length,
    2,
  );
  assert.match(
    stockClientSource,
    /\) : isCompactLayout \? \(\s*<div className="grid gap-2 md:grid-cols-2">/s,
  );
  assert.match(stockClientSource, /className="col-span-full"\s+compact/);
  assert.doesNotMatch(
    stockClientSource,
    /aria-pressed=\{stockFilter === "low"\}/,
  );
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
  assert.match(branchStockClientSource, /value=\{status\}/);
  assert.match(branchStockClientSource, /value=\{location\}/);
  assert.match(branchStockClientSource, /hasMultipleStockLocations/);
  assert.match(branchStockClientSource, /filtersOpen \? "grid" : "hidden"/);
  assert.equal(
    (branchStockClientSource.match(/<SelectTrigger\s+size="touch"/g) ?? [])
      .length,
    3,
  );
  assert.match(
    branchStockClientSource,
    /<ItemGroup className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">/,
  );
  assert.equal(
    (branchStockClientSource.match(/size="icon-touch"/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(branchStockClientSource, /StockMobileGrid|DataTable/);
  assert.doesNotMatch(branchStockClientSource, /overflow-x-auto/);
});

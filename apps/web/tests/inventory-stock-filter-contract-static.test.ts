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
const stockMobileGridSource = readWeb(
  "app/(protected)/inventory/stock/stock-mobile-grid.tsx",
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
    /bulk=\{\s*!embedded && !isCompactLayout \? \(\s*<div[^>]*>\s*\{filterControls\}\s*\{workSignalCluster\}/s,
  );
  assert.doesNotMatch(stockClientSource, /aria-pressed=\{stockFilter === "low"\}/);
  assert.doesNotMatch(
    stockClientSource,
    /setStockFilter\(stockFilter === "low" \? "all" : "low"\)/,
  );
});

test("inventory stock low filter matches the under-threshold badge predicate", () => {
  assert.match(stockClientSource, /function isReorderRisk/);
  assert.match(stockClientSource, /result = result\.filter\(isReorderRisk\);/);
});

test("operator stock category chips use parent filter state", () => {
  assert.doesNotMatch(stockMobileGridSource, /useState/);
  assert.match(stockMobileGridSource, /activeCategory: string/);
  assert.match(stockMobileGridSource, /onCategoryChange: \(value: string\) => void/);
  assert.match(stockMobileGridSource, /value=\{activeCategory\}/);
  assert.match(stockMobileGridSource, /onValueChange=\{onCategoryChange\}/);
  assert.doesNotMatch(stockMobileGridSource, /activeCategory === STOCK_ALL_CATEGORY_VALUE/);
  assert.doesNotMatch(stockMobileGridSource, /ingredient\.category === activeCategory/);

  assert.match(stockClientSource, /<StockMobileGrid\s+ingredients=\{filtered\}/);
  assert.match(stockClientSource, /categories=\{categories\}/);
  assert.match(stockClientSource, /hasUncategorized=\{hasUncategorized\}/);
  assert.match(stockClientSource, /activeCategory=\{activeCategory\}/);
  assert.match(stockClientSource, /onCategoryChange=\{setActiveCategory\}/);
});

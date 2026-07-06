import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const ingredientsClientSource = readWeb(
  "app/(protected)/inventory/ingredients/ingredients-client.tsx",
);
const stockMobileGridSource = readWeb(
  "app/(protected)/inventory/stock/stock-mobile-grid.tsx",
);

test("inventory ingredients list exposes item kind visibly and as a filter", () => {
  assert.match(ingredientsClientSource, /ITEM_KIND_LABELS/);
  assert.match(ingredientsClientSource, /ITEM_KIND_OPTIONS/);
  assert.match(ingredientsClientSource, /const \[itemKind, setItemKind\]/);
  assert.match(ingredientsClientSource, /item\.item_kind === itemKind/);
  assert.match(ingredientsClientSource, /itemKindLabel\(item\)/);
});

test("inventory stock mobile grid labels item kind separately from category", () => {
  assert.match(stockMobileGridSource, /ITEM_KIND_LABELS/);
  assert.match(
    stockMobileGridSource,
    /ITEM_KIND_LABELS\[item\.itemKind\] \?\? item\.itemKind/,
  );
  assert.match(stockMobileGridSource, /CATEGORY_TONE_CLASS/);
});

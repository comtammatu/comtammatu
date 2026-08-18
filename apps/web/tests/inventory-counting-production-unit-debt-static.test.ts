import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const unitOptionsSource = readWeb("lib/inventory/unit-options.ts");
const countUnitsSource = readWeb(
  "app/(protected)/inventory/_lib/count-units.ts",
);
const issueUnitsSource = readWeb(
  "app/(protected)/inventory/_lib/issue-units.ts",
);
const purchaseUnitsSource = readWeb("lib/inventory/purchase-units.ts");
const stocktakeWizardSource = readWeb(
  "app/(protected)/inventory/stocktake/[id]/count/stocktake-count-wizard.tsx",
);
const stocktakeCountClientSource = readWeb(
  "app/(protected)/inventory/stocktake/[id]/count/count-client.tsx",
);
const stocktakeCountPageSource = readWeb(
  "app/(protected)/inventory/stocktake/[id]/count/page.tsx",
);
const stocktakeDetailSource = readWeb(
  "app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
);
const productionRunActionsSource = readWeb(
  "app/(protected)/inventory/production-run-actions.ts",
);
const productionNewClientSource = readWeb(
  "app/(protected)/inventory/production/production-create-dialog.tsx",
);

test("inventory unit option helpers delegate to one shared implementation", () => {
  assert.match(unitOptionsSource, /function activeUnits/);
  assert.match(unitOptionsSource, /getIngredientUnitOptions/);
  assert.match(unitOptionsSource, /getLargestIngredientUnit/);

  for (const source of [countUnitsSource, issueUnitsSource]) {
    assert.match(source, /from "@lib\/inventory\/unit-options"/);
    assert.match(source, /getIngredientUnitOptions/);
    assert.doesNotMatch(source, /\.filter\(\(u/);
    assert.doesNotMatch(source, /\.sort\(\(a, b\)/);
  }
  assert.match(purchaseUnitsSource, /from "\.\/unit-options"/);
  assert.match(purchaseUnitsSource, /getIngredientUnitOptions/);
  assert.doesNotMatch(purchaseUnitsSource, /\.filter\(\(u/);
  assert.doesNotMatch(purchaseUnitsSource, /\.sort\(\(a, b\)/);
  assert.match(countUnitsSource, /pickDefaultCountUnit/);
  assert.match(countUnitsSource, /getLargestIngredientUnit/);
  assert.doesNotMatch(purchaseUnitsSource, /\.reduce</);
});

test("stocktake wizard opens NumberPadSheet per line and commits on confirm", () => {
  assert.match(stocktakeWizardSource, /NumberPadSheet/);
  assert.match(stocktakeWizardSource, /setSheetIngredientId\(line\.ingredientId\)/);
  assert.match(stocktakeWizardSource, /function handleSheetConfirm\(value: number\)/);
  assert.match(
    stocktakeWizardSource,
    /onCountChange\(sheetLine\.ingredientId, value\)/,
  );
  assert.match(stocktakeWizardSource, /onConfirm=\{handleSheetConfirm\}/);
  assert.match(stocktakeWizardSource, /allowDecimal/);
  assert.doesNotMatch(stocktakeWizardSource, /NumberPadGrid/);
  assert.match(stocktakeWizardSource, /AppDetailFooter[\s\S]*sticky/);
});

test("stocktake count respects session blind mode", () => {
  assert.match(stocktakeCountPageSource, /blind_mode/);
  assert.match(
    stocktakeCountPageSource,
    /blindMode=\{Boolean\(sessionRow\.blind_mode\)\}/,
  );
  assert.match(stocktakeCountClientSource, /blindMode: boolean/);
  assert.doesNotMatch(stocktakeCountClientSource, /const blindMode = true/);
});

test("stocktake review does not edit counts; pad uses the NumberPad wizard", () => {
  assert.doesNotMatch(stocktakeDetailSource, /QuantityInput/);
  assert.doesNotMatch(
    stocktakeDetailSource,
    /stocktake-desktop-|stocktake-mobile-/,
  );
  assert.match(stocktakeCountClientSource, /StocktakeCountWizard/);
  assert.doesNotMatch(stocktakeCountClientSource, /BlindCountingGrid/);
  assert.doesNotMatch(stocktakeCountClientSource, /Round R|Blind mode/);
});

test("production create uses recipe output ratio without actual usage inputs", () => {
  assert.match(productionRunActionsSource, /recipe_quantity: number/);
  assert.match(
    productionNewClientSource,
    /planned \/ selectedRecipe\.outputQuantity/,
  );
  assert.match(
    productionNewClientSource,
    /batchRatio \* ingredient\.recipe_quantity/,
  );
  assert.doesNotMatch(
    productionNewClientSource,
    /actualIngredients|actual_quantity/,
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const unitOptionsSource = readWeb(
  "lib/inventory/unit-options.ts",
);
const countUnitsSource = readWeb("app/(protected)/inventory/_lib/count-units.ts");
const issueUnitsSource = readWeb("app/(protected)/inventory/_lib/issue-units.ts");
const purchaseUnitsSource = readWeb(
  "lib/inventory/purchase-units.ts",
);
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
  "app/(protected)/inventory/production/new/production-new-client.tsx",
);

test("inventory unit option helpers delegate to one shared implementation", () => {
  assert.match(unitOptionsSource, /function activeUnits/);
  assert.match(unitOptionsSource, /getIngredientUnitOptions/);
  assert.match(unitOptionsSource, /getIngredientRoleUnit/);
  assert.match(unitOptionsSource, /getLargestIngredientUnit/);

  for (const source of [countUnitsSource, issueUnitsSource]) {
    assert.match(source, /from "@lib\/inventory\/unit-options"/);
    assert.match(source, /getIngredientRoleUnit/);
    assert.doesNotMatch(source, /\.filter\(\(u/);
    assert.doesNotMatch(source, /\.sort\(\(a, b\)/);
  }
  assert.match(purchaseUnitsSource, /from "\.\/unit-options"/);
  assert.match(purchaseUnitsSource, /getIngredientRoleUnit/);
  assert.doesNotMatch(purchaseUnitsSource, /\.filter\(\(u/);
  assert.doesNotMatch(purchaseUnitsSource, /\.sort\(\(a, b\)/);
  for (const source of [
    countUnitsSource,
    issueUnitsSource,
  ]) {
    assert.match(source, /getIngredientRoleUnit/);
  }
  assert.match(countUnitsSource, /pickDefaultCountUnit/);
  assert.doesNotMatch(purchaseUnitsSource, /\.reduce</);
});

test("stocktake wizard commits or rejects the active buffer before row navigation", () => {
  assert.match(stocktakeWizardSource, /const commitActiveBuffer = useCallback/);
  assert.match(stocktakeWizardSource, /parseVietnameseNumericInput/);
  assert.match(stocktakeWizardSource, /parsed\.state !== "valid"/);
  assert.match(
    stocktakeWizardSource,
    /onCountChange\(activeLine\.ingredientId, parsed\.value\)/,
  );
  assert.doesNotMatch(stocktakeWizardSource, /Number\(raw\)/);
  assert.match(stocktakeWizardSource, /const moveActiveIndex = useCallback/);
  assert.match(
    stocktakeWizardSource,
    /moveActiveIndex\(\(prev\) => \(prev > 0 \? prev - 1 : prev\)\)/,
  );
  assert.match(
    stocktakeWizardSource,
    /moveActiveIndex\(\(prev\) => \(prev < total - 1 \? prev \+ 1 : prev\)\)/,
  );
});

test("stocktake count respects session blind mode", () => {
  assert.match(stocktakeCountPageSource, /blind_mode/);
  assert.match(stocktakeCountPageSource, /blindMode=\{Boolean\(sessionRow\.blind_mode\)\}/);
  assert.match(stocktakeCountClientSource, /blindMode: boolean/);
  assert.doesNotMatch(stocktakeCountClientSource, /const blindMode = true/);
});

test("classic stocktake count inputs keep stable keys across saved refreshes", () => {
  assert.match(stocktakeDetailSource, /key=\{`stocktake-desktop-\$\{line\.id\}`\}/);
  assert.match(stocktakeDetailSource, /key=\{`stocktake-mobile-\$\{line\.id\}`\}/);
  assert.doesNotMatch(stocktakeDetailSource, /stocktake-desktop-\$\{line\.id\}-/);
  assert.doesNotMatch(stocktakeDetailSource, /stocktake-mobile-\$\{line\.id\}-/);
});

test("production create uses recipe output ratio without actual usage inputs", () => {
  assert.match(productionRunActionsSource, /recipe_quantity: number/);
  assert.match(productionNewClientSource, /planned \/ selectedRecipe\.outputQuantity/);
  assert.match(productionNewClientSource, /batchRatio \* ingredient\.recipe_quantity/);
  assert.doesNotMatch(productionNewClientSource, /actualIngredients|actual_quantity/);
});

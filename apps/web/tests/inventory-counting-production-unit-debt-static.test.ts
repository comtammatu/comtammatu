import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const unitOptionsSource = readWeb(
  "app/(protected)/inventory/_lib/unit-options.ts",
);
const countUnitsSource = readWeb("app/(protected)/inventory/_lib/count-units.ts");
const issueUnitsSource = readWeb("app/(protected)/inventory/_lib/issue-units.ts");
const purchaseUnitsSource = readWeb(
  "app/(protected)/inventory/_lib/purchase-units.ts",
);
const productionUnitsSource = readWeb(
  "app/(protected)/inventory/_lib/production-units.ts",
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
  assert.match(unitOptionsSource, /getDefaultIngredientUnit/);
  assert.match(unitOptionsSource, /getLargestIngredientUnit/);

  for (const source of [
    countUnitsSource,
    issueUnitsSource,
    purchaseUnitsSource,
    productionUnitsSource,
  ]) {
    assert.match(source, /from "\.\/unit-options"/);
    assert.match(source, /getIngredientUnitOptions/);
    assert.doesNotMatch(source, /\.filter\(\(u/);
    assert.doesNotMatch(source, /\.sort\(\(a, b\)/);
  }
  for (const source of [
    countUnitsSource,
    issueUnitsSource,
    productionUnitsSource,
  ]) {
    assert.match(source, /getDefaultIngredientUnit/);
  }
  assert.match(purchaseUnitsSource, /getLargestIngredientUnit/);
  assert.doesNotMatch(purchaseUnitsSource, /\.reduce</);
  assert.match(issueUnitsSource, /includeToBaseFactor: true/);
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

test("production create client consumes server-action recipe usage values", () => {
  assert.match(productionRunActionsSource, /default_usage_per_fg: number/);
  assert.match(productionRunActionsSource, /default_usage_per_fg:/);
  assert.match(productionNewClientSource, /ing\.default_usage_per_fg/);
  assert.doesNotMatch(
    productionNewClientSource,
    /ing\.recipe_quantity\) \/ ing\.yield_factor/,
  );
  assert.doesNotMatch(productionNewClientSource, /ing\.recipe_quantity \/ ing\.yield_factor/);
});

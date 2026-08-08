import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("operator inventory work routes expose touch progress steps", () => {
  const component = read(
    "apps/web/app/(protected)/inventory/_components/operator-flow-steps.tsx",
  );

  assert.match(component, /@comtammatu\/ui\/components\/progress/);
  assert.match(component, /copy\.stepBadge\(active, total\)/);
  assert.match(component, /sm:hidden/);
  assert.match(component, /hidden gap-2 sm:grid/);

  const routeClients = [
    [
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/grn-review-operator-client.tsx",
      /grnCopy\.inspectionItemsTitle/,
    ],
    [
      "apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
      /operatorFlow\.stocktakeListTitle/,
    ],
    [
      "apps/web/app/(protected)/inventory/production-recipe-panel.tsx",
      /operatorFlow\.productionRecipeTitle/,
    ],
  ] as const;

  for (const [path, marker] of routeClients) {
    const source = read(path);
    assert.match(source, /<OperatorFlowSteps/);
    assert.match(source, marker);
  }

  const branchOnHand = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  );
  assert.doesNotMatch(branchOnHand, /OperatorFlowSteps/);
  assert.match(branchOnHand, /BranchOperatorPanel/);
  assert.match(branchOnHand, /StockTouchRow/);

  const branchGrnList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
  );
  assert.doesNotMatch(branchGrnList, /OperatorFlowSteps/);
  assert.match(branchGrnList, /BranchOperatorPage/);
  assert.match(branchGrnList, /BranchOperatorPanel/);
  assert.match(branchGrnList, /ItemGroup/);

  for (const path of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/[id]/page.tsx",
  ]) {
    const branchProductionRedirect = read(path);
    assert.match(branchProductionRedirect, /redirect\(/);
    assert.match(branchProductionRedirect, /\/inventory\/production/);
    assert.doesNotMatch(branchProductionRedirect, /OperatorFlowSteps|NumberPadSheet/);
  }
});

test("transfer receive keeps the phone first viewport on line receiving", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-client.tsx",
  );

  assert.doesNotMatch(source, /OperatorFlowSteps/);
  assert.match(source, /receiveProgress/);
  assert.match(source, /receiveNextLine/);
  assert.match(source, /receiveTapToEnter/);
});

test("stocktake count uses NumberPadSheet and a single sticky submit", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/count/stocktake-count-wizard.tsx",
  );

  assert.doesNotMatch(source, /OperatorFlowSteps/);
  assert.match(source, /@comtammatu\/ui\/components\/progress/);
  assert.match(source, /progressValue/);
  assert.match(source, /NumberPadSheet/);
  assert.doesNotMatch(source, /NumberPadGrid/);
  assert.match(source, /AppDetailFooter[\s\S]*sticky/);
});

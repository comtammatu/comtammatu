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
      "apps/web/app/(protected)/inventory/transfers/transfers-list-client.tsx",
      /operatorFlow\.transferListTitle/,
    ],
    [
      "apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
      /operatorFlow\.stocktakeListTitle/,
    ],
    [
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/production-operator-client.tsx",
      /operatorFlow\.productionTitle/,
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

  const recipeRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/recipes/page.tsx",
  );
  const recipePanel = read(
    "apps/web/app/(protected)/inventory/production-recipe-panel.tsx",
  );
  const messageSource = read("apps/web/lib/messages/inventory.ts");

  assert.match(recipeRoute, /<ProductionRecipePanel[\s\S]*embedded/);
  assert.match(recipePanel, /const recipeStep =/);
  assert.match(recipePanel, /groupedRecipes\.length === 0/);
  assert.match(recipePanel, /embedded\?: boolean/);
  assert.match(recipePanel, /actionSize=\{embedded \? "touch" : "default"\}/);
  assert.match(recipePanel, /size=\{embedded \? "icon-touch" : "sm"\}/);
  assert.match(messageSource, /productionRecipeSteps/);
});

test("transfer create gates embedded sections by touch workflow state", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/branch-transfer-create-client.tsx",
  );
  const dataSource = read("apps/web/lib/inventory/transfer-create-data.ts");
  const modelSource = read("apps/web/lib/inventory/transfer-create-model.ts");

  assert.doesNotMatch(source, /<OperatorFlowSteps/);
  assert.match(source, /@comtammatu\/ui\/components\/progress/);
  assert.match(source, /controller\.flowProgressValue/);
  assert.match(source, /controller\.selectedBranch \? \(/);
  assert.match(source, /controller\.draftLines\.length > 0 \? \(/);
  assert.match(modelSource, /export interface TransferIngredientOption/);
  assert.match(dataSource, /function toTransferIngredientOption/);
  assert.match(dataSource, /id: ingredient\.id/);
  assert.match(dataSource, /units: ingredient\.units/);
  assert.doesNotMatch(source, /IngredientRow/);
});

test("transfer create uses compact branch-location labels", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/branch-transfer-create-client.tsx",
  );
  const modelSource = read("apps/web/lib/inventory/transfer-create-model.ts");

  assert.match(modelSource, /export function formatTransferSiteLabel/);
  assert.match(modelSource, /return branch\.name/);
  assert.match(
    modelSource,
    /export function formatTransferLocationLabel/,
  );
  assert.match(
    modelSource,
    /formatTransferLocationLabel\(option\.branch, option\.kind\)/,
  );
  assert.match(
    source,
    /formatTransferOption\(\s*branch,\s*controller\.requestDestinationBranchId/,
  );
  assert.match(
    modelSource,
    /formatTransferLocationLabel\(branch, "warehouse"\)/,
  );
  assert.doesNotMatch(modelSource, /default(?:Warehouse|Kitchen)Suffix/);
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

test("stocktake count keeps the phone first viewport on active number entry", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/count/stocktake-count-wizard.tsx",
  );

  assert.doesNotMatch(source, /OperatorFlowSteps/);
  assert.match(source, /@comtammatu\/ui\/components\/progress/);
  assert.match(source, /progressValue/);
  assert.match(source, /NumberPadGrid/);
  assert.match(source, /countUpNext/);
});

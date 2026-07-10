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

  const branchProduction = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/production-operator-client.tsx",
  );
  assert.doesNotMatch(branchProduction, /OperatorFlowSteps/);
  assert.match(branchProduction, /BranchOperatorStatusStrip/);
  assert.match(branchProduction, /title="Việc cần làm"/);
  assert.match(
    branchProduction,
    /const workQueue = \[\.\.\.inProgress, \.\.\.drafts\]/,
  );

  const recipeRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/recipes/page.tsx",
  );
  const recipeListClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/recipes/branch-production-recipes-client.tsx",
  );
  const recipeEditorClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/recipes/branch-production-recipe-editor-client.tsx",
  );

  assert.match(recipeRoute, /<BranchProductionRecipesClient/);
  assert.match(recipeListClient, /BranchOperatorStatusStrip/);
  assert.match(recipeListClient, /<ItemGroup/);
  assert.match(recipeEditorClient, /<SheetContent/);
  assert.match(recipeEditorClient, /side="bottom"/);
  assert.match(recipeEditorClient, /sm:max-w-lg/);
  assert.match(recipeEditorClient, /sm:!right-0 sm:!left-auto/);
  assert.match(recipeEditorClient, /className="h-11"/);
  assert.doesNotMatch(
    `${recipeRoute}\n${recipeListClient}\n${recipeEditorClient}`,
    /ProductionRecipePanel|FormDialog|DataTable|embedded/,
  );
});

test("transfer create gates embedded sections by touch workflow state", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/branch-transfer-create-client.tsx",
  );
  const dataSource = read("apps/web/lib/inventory/transfer-create-data.ts");
  const modelSource = read("apps/web/lib/inventory/transfer-create-model.ts");
  const controllerSource = read(
    "apps/web/lib/inventory/use-transfer-create-controller.ts",
  );

  assert.doesNotMatch(source, /<OperatorFlowSteps/);
  assert.match(source, /@comtammatu\/ui\/components\/progress/);
  assert.match(source, /controller\.flowProgressValue/);
  assert.match(source, /controller\.selectedBranch \? \(/);
  assert.match(source, /controller\.draftLines\.length > 0 \? \(/);
  assert.match(modelSource, /export interface TransferIngredientOption/);
  assert.match(dataSource, /function toTransferIngredientOption/);
  assert.match(dataSource, /id: ingredient\.id/);
  assert.match(dataSource, /itemKind: ingredient\.item_kind \?\? null/);
  assert.match(dataSource, /units: ingredient\.units/);
  assert.match(dataSource, /"production_storage"/);
  assert.match(modelSource, /getTransferSourceLocationOptions/);
  assert.match(modelSource, /location\.kind === "production_storage"/);
  assert.match(modelSource, /getTransferSelectableIngredients/);
  assert.match(modelSource, /ingredient\.itemKind === "finished_good"/);
  assert.match(controllerSource, /selectedSourceBranch\?\.branch_kind/);
  assert.doesNotMatch(source, /IngredientRow/);
});

test("transfer create uses compact branch-location labels", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/branch-transfer-create-client.tsx",
  );
  const modelSource = read("apps/web/lib/inventory/transfer-create-model.ts");

  assert.match(modelSource, /export function formatTransferSiteLabel/);
  assert.match(modelSource, /return branch\.name/);
  assert.match(modelSource, /export function formatTransferLocationLabel/);
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

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

  const branchGrnReview = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/grn-review-operator-client.tsx",
  );
  assert.doesNotMatch(branchGrnReview, /OperatorFlowSteps/);
  assert.match(branchGrnReview, /grnCopy\.inspectionItemsTitle/);

  const branchOnHand = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  );
  assert.doesNotMatch(branchOnHand, /OperatorFlowSteps/);
  assert.doesNotMatch(branchOnHand, /BranchOperatorPanel/);
  assert.match(branchOnHand, /StockTouchRow/);

  const branchGrnList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
  );
  assert.doesNotMatch(branchGrnList, /OperatorFlowSteps/);
  assert.match(branchGrnList, /BranchOperatorPage/);
  assert.doesNotMatch(branchGrnList, /BranchOperatorPanel/);
  assert.match(branchGrnList, /SectionLabel/);
  assert.match(branchGrnList, /ItemGroup/);

  const branchProduction = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/production-operator-client.tsx",
  );
  assert.doesNotMatch(branchProduction, /OperatorFlowSteps/);
  assert.doesNotMatch(branchProduction, /BranchOperatorStatusStrip/);
  assert.match(branchProduction, /title="Việc cần làm"/);
  assert.match(
    branchProduction,
    /const workQueue = \[\.\.\.inProgress, \.\.\.drafts\]/,
  );
  assert.match(
    branchProduction,
    /workQueue\.length > 0[\s\S]*completed\.length > 0/,
  );

  const branchProductionNew = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/branch-production-new-client.tsx",
  );
  assert.match(
    branchProductionNew,
    /const hasSourceLocationChoice = sourceLocations\.length > 1/,
  );
  assert.match(
    branchProductionNew,
    /const hasTargetLocationChoice = targetLocations\.length > 1/,
  );
  assert.match(branchProductionNew, /\{hasLocationChoices \? \(/);
  assert.doesNotMatch(branchProductionNew, /BranchOperatorStatusStrip/);
  assert.match(branchProductionNew, /NumberPadSheet/);
  assert.doesNotMatch(branchProductionNew, /QuantityInput/);
  assert.match(branchProductionNew, /const canRecordProductionRun/);
  assert.match(branchProductionNew, /await recordProductionRun/);
  assert.doesNotMatch(branchProductionNew, /await createProductionRun/);
  assert.doesNotMatch(branchProductionNew, /await confirmProductionRun/);
  assert.doesNotMatch(branchProductionNew, /createdRunId/);
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

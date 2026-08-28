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

  const grnReview = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/grn-review-operator-client.tsx",
  );
  assert.match(grnReview, /<OperatorFlowSteps/);
  assert.match(grnReview, /grnCopy\.inspectionItemsTitle/);

  const stocktakeWizard = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/count/stocktake-count-wizard.tsx",
  );
  assert.doesNotMatch(stocktakeWizard, /OperatorFlowSteps/);
  assert.match(stocktakeWizard, /@comtammatu\/ui\/components\/progress/);

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
  const messages = read("apps/web/lib/messages/inventory.ts");

  assert.doesNotMatch(source, /OperatorFlowSteps/);
  assert.match(source, /@comtammatu\/ui\/components\/progress/);
  assert.match(source, /receiveProgress/);
  assert.match(source, /receiveReviewHint/);
  assert.match(source, /receiveTapToEnter/);
  assert.doesNotMatch(
    source,
    /receiveNextLine|receiveConfirmAllAsSent|handleConfirmAllAsSent/,
  );
  assert.match(
    messages,
    /receiveReviewHint: "Chạm từng dòng nếu số nhận khác số gửi\."/,
  );
  assert.match(messages, /dòng chưa nhập sẽ dùng số lượng đã gửi/);
  assert.doesNotMatch(messages, /Dòng kế|Nhận đủ theo phiếu/);
});

test("stocktake count uses NumberPadSheet and a single sticky submit", () => {
  const wizard = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/count/stocktake-count-wizard.tsx",
  );
  const ownerCount = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/count/count-client.tsx",
  );

  assert.doesNotMatch(wizard, /OperatorFlowSteps/);
  assert.match(wizard, /@comtammatu\/ui\/components\/progress/);
  assert.match(wizard, /progressValue/);
  assert.match(wizard, /NumberPadSheet/);
  assert.doesNotMatch(wizard, /NumberPadGrid/);
  assert.match(wizard, /AppDetailFooter[\s\S]*sticky/);
  assert.match(ownerCount, /StocktakeCountWizard/);
});

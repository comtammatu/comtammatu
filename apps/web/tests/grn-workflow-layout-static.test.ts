import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("GRN list and detail keep controls inside one coherent workflow", () => {
  const list = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const detail = read(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const lineRow = read(
    "app/(protected)/inventory/grn/[id]/views/grn-line-row.tsx",
  );
  const operatorDetail = read(
    "app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/grn-review-operator-client.tsx",
  );
  const actions = read("lib/inventory/use-grn-detail-actions.ts");
  const grnActions = read("app/(protected)/inventory/grn-actions.ts");
  const messages = read("lib/messages/inventory.ts");

  assert.match(
    list,
    /min-w-64 flex-1/,
  );
  assert.doesNotMatch(detail, /function LineMetrics/);
  assert.match(detail, /header: grnCopy\.lineHeaderOrdered/);
  assert.match(detail, /line\.poQuantity \?\? line\.remainingQuantity/);
  assert.match(detail, /header: grnCopy\.lineHeaderQty/);
  assert.match(
    grnActions,
    /if \(linkedGrn\?\.id === grn\.id\) continue/,
  );
  assert.match(detail, /header: grnCopy\.lineHeaderUnitPrice/);
  assert.match(detail, /section="quantity"/);
  assert.match(detail, /section="unitPrice"/);
  assert.match(detail, /section="rejection"/);
  assert.match(detail, /compactLabels/);
  assert.doesNotMatch(detail, /key: "rejected"/);
  assert.match(detail, /showHeader=\{false\}/);
  assert.match(lineRow, /compactLabels/);
  assert.doesNotMatch(lineRow, /unitPriceHint/);
  assert.doesNotMatch(lineRow, /<details/);
  assert.match(messages, /qcQueue: "Ghi hàng từ chối"/);
  assert.match(detail, /header: "Kết quả"/);
  assert.match(detail, /confirmableGrnSuppliers\(lines\)/);
  assert.match(detail, /grnCopy\.line\.notInspected/);
  assert.match(operatorDetail, /confirmableGrnSuppliers\(lines\)/);
  assert.match(actions, /confirmNoAcceptedQuantity/);
  assert.match(detail, /<DocumentFormFrame/);
  assert.match(detail, /confirmButtons/);
  assert.match(detail, /handleConfirmGrn/);
  assert.doesNotMatch(detail, /grnCopy\.acceptedLines/);
  assert.doesNotMatch(detail, /grnCopy\.nextStepReadyTitle/);
  assert.doesNotMatch(detail, /formatVND/);
});

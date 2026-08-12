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

  assert.match(
    list,
    /min-w-64 flex-1/,
  );
  assert.doesNotMatch(detail, /function LineMetrics/);
  assert.match(detail, /header: "Theo đơn"/);
  assert.match(detail, /header: grnCopy\.lineHeaderQty/);
  assert.doesNotMatch(detail, /key: "rejected"/);
  assert.match(detail, /showHeader=\{false\}/);
  assert.match(lineRow, /grnCopy\.line\.acceptedLabel/);
  assert.match(lineRow, /<details/);
  assert.match(detail, /header: "Kết quả"/);
  assert.match(detail, /hasAcceptedGrnQuantity\(lines\)/);
  assert.match(detail, /grnCopy\.line\.notInspected/);
  assert.match(operatorDetail, /hasAcceptedGrnQuantity\(lines\)/);
  assert.match(actions, /confirmNoAcceptedQuantity/);
  assert.match(detail, /<DocumentFormFrame/);
  assert.match(
    detail,
    /canMutateDraft && dirtyLines\.length > 0 \? \([\s\S]*?handleSave[\s\S]*?\) : \([\s\S]*?handleConfirmGrn/,
  );
  assert.doesNotMatch(detail, /grnCopy\.acceptedLines/);
  assert.doesNotMatch(detail, /grnCopy\.nextStepReadyTitle/);
  assert.doesNotMatch(detail, /formatVND/);
});

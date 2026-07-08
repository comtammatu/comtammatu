import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildCountSlipLineView } from "../app/(protected)/inventory/count-slips/line-view-model";

test("count slip review keeps entry unit separate from base comparison", () => {
  const line = buildCountSlipLineView({
    id: 1,
    ingredientName: "Nước Suối - Thành Phẩm",
    systemQuantity: 2.417,
    countedQuantity: 5,
    entryUnitId: 10,
    entryUnitCode: "chai",
    baseUnitCode: "thùng",
    toBaseFactor: 1 / 24,
    note: null,
  });

  assert.equal(line.countedQuantity, 5);
  assert.equal(line.countedUnit, "chai");
  assert.equal(line.systemUnit, "thùng");
  assert.equal(line.varianceUnit, "thùng");
  assert.equal(Number(line.countedBaseQuantity?.toFixed(3)), 0.208);
  assert.equal(Number(line.variance?.toFixed(3)), -2.209);
});

test("count slip review converts employee kg counts before comparing gram stock", () => {
  const line = buildCountSlipLineView({
    id: 2,
    ingredientName: "Sườn cây",
    systemQuantity: 5000,
    countedQuantity: 5,
    entryUnitId: 20,
    entryUnitCode: "kg",
    baseUnitCode: "g",
    toBaseFactor: 1000,
    note: null,
  });

  assert.equal(line.countedQuantity, 5);
  assert.equal(line.countedUnit, "kg");
  assert.equal(line.systemQuantity, 5000);
  assert.equal(line.systemUnit, "g");
  assert.equal(line.countedBaseQuantity, 5000);
  assert.equal(line.variance, 0);
});

test("count slip review no longer trusts mixed-unit generated variance", () => {
  const source = readFileSync(
    join(process.cwd(), "app/(protected)/inventory/count-slips/page.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /\n\s*variance,/);
  assert.match(source, /to_base_factor/);
  assert.match(source, /buildCountSlipLineView/);
});

test("employee count UI previews the comparison unit before submission", () => {
  const pageSource = readFileSync(
    join(process.cwd(), "lib/staff-runtime/count/page.tsx"),
    "utf8",
  );
  const clientSource = readFileSync(
    join(process.cwd(), "lib/staff-runtime/count/count-client.tsx"),
    "utf8",
  );

  assert.match(pageSource, /to_base_factor/);
  assert.match(pageSource, /toBaseFactor/);
  assert.match(clientSource, /buildCountUnitPreview/);
  assert.match(clientSource, /So sánh tồn/);
  assert.match(clientSource, /Tồn so theo/);
  assert.match(clientSource, /Textarea/);
  assert.match(clientSource, /maxLength=\{500\}/);
  assert.match(clientSource, /selectedUnit\?\.code/);
  assert.doesNotMatch(clientSource, /assignment\.measureUnit/);
  assert.doesNotMatch(pageSource, /measureUnit/);
  assert.doesNotMatch(clientSource, /className="w-24 shrink-0"/);
});

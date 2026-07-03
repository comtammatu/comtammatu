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

test("count slip review no longer trusts mixed-unit generated variance", () => {
  const source = readFileSync(
    join(process.cwd(), "app/(protected)/inventory/count-slips/page.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /\n\s*variance,/);
  assert.match(source, /to_base_factor/);
  assert.match(source, /buildCountSlipLineView/);
});

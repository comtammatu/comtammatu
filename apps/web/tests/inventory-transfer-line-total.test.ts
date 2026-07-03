import assert from "node:assert/strict";
import { test } from "node:test";
import { computeTransferLineTotal } from "../app/(protected)/inventory/transfers/[id]/line-view-model";

test("transfer line total converts entry-unit qty to base before pricing", () => {
  // 2 thùng x 12kg/thùng x 10.000đ/kg = 240.000đ
  const { baseQuantity, total } = computeTransferLineTotal({
    entryQuantity: 2,
    baseUnitCost: 10000,
    entryUnitId: 10,
    toBaseFactor: 12,
  });

  assert.equal(baseQuantity, 24);
  assert.equal(total, 240000);
});

test("transfer line total is a no-op when entry unit already is base", () => {
  const { baseQuantity, total } = computeTransferLineTotal({
    entryQuantity: 5,
    baseUnitCost: 10000,
    entryUnitId: null,
    toBaseFactor: null,
  });

  assert.equal(baseQuantity, 5);
  assert.equal(total, 50000);
});

test("transfer line total falls back to entry qty when factor is unresolved", () => {
  const { baseQuantity, total } = computeTransferLineTotal({
    entryQuantity: 3,
    baseUnitCost: 1000,
    entryUnitId: 99,
    toBaseFactor: null,
  });

  assert.equal(baseQuantity, 3);
  assert.equal(total, 3000);
});

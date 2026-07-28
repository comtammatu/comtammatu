import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEditableGrnLine,
  isGrnLookupParam,
} from "../lib/inventory/grn-detail-model";

test("GRN detail lookup accepts safe numeric IDs and GRN document numbers", () => {
  assert.equal(isGrnLookupParam("42"), true);
  assert.equal(isGrnLookupParam("GRN-20260710-01"), true);
  assert.equal(isGrnLookupParam("GRN-2026-0001"), true);
  assert.equal(isGrnLookupParam("0"), false);
  assert.equal(isGrnLookupParam("GRN-"), false);
  assert.equal(isGrnLookupParam("../../42"), false);
});

test("new locally-added GRN detail line starts persisted without manual QC state", () => {
  const line = createEditableGrnLine({
    lineId: 9,
    ingredient: {
      id: 4,
      name: "Gạo thơm",
      sku: "GAO-01",
      category: null,
      category_id: null,
      item_kind: "ingredient",
      unit_cost: null,
      min_stock_level: null,
      max_stock_level: null,
      reorder_point: null,
      storage_type: null,
      is_active: true,
      updated_at: null,
    },
    quantity: 10,
    entryUnitId: 2,
    unit: "kg",
  });

  assert.deepEqual(
    {
      id: line.lineId,
      ingredientId: line.ingredientId,
      actual: line.actual,
      rejected: line.rejected,
      dirty: line.dirty,
    },
    {
      id: 9,
      ingredientId: 4,
      actual: 10,
      rejected: 0,
      dirty: false,
    },
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEditableGrnLine,
  deriveGrnVariance,
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

test("GRN variance is null without a PO price and rounded when present", () => {
  assert.equal(deriveGrnVariance(120, null), null);
  assert.equal(deriveGrnVariance(120, 0), null);
  assert.equal(deriveGrnVariance(125, 100), 25);
  assert.equal(deriveGrnVariance(100.01, 100), 0.01);
});

test("new locally-added GRN detail line starts persisted and accepted", () => {
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
    unitCost: 18_000,
  });

  assert.deepEqual(
    {
      id: line.lineId,
      ingredientId: line.ingredientId,
      accepted: line.accepted,
      rejected: line.rejected,
      dirty: line.dirty,
      quality: line.qualityStatus,
    },
    {
      id: 9,
      ingredientId: 4,
      accepted: 10,
      rejected: 0,
      dirty: false,
      quality: "accepted",
    },
  );
});

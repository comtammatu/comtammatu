import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateGrnQuantities,
  createEditableGrnLine,
  hasAcceptedGrnQuantity,
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
    supplierId: 3,
    supplierName: "NCC Gạo",
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

test("GRN quantities cap PO fulfillment and keep accepted excess separate", () => {
  assert.deepEqual(calculateGrnQuantities(54, 0, 48), {
    acceptedQuantity: 54,
    poAppliedQuantity: 48,
    shortageQuantity: 0,
    excessQuantity: 6,
  });
  assert.deepEqual(calculateGrnQuantities(40, 2, 48), {
    acceptedQuantity: 38,
    poAppliedQuantity: 38,
    shortageQuantity: 10,
    excessQuantity: 0,
  });
});

test("GRN can only be confirmed after at least one accepted quantity", () => {
  assert.equal(
    hasAcceptedGrnQuantity([
      { actual: 0, rejected: 0 },
      { actual: 5, rejected: 5 },
    ]),
    false,
  );
  assert.equal(
    hasAcceptedGrnQuantity([
      { actual: 0, rejected: 0 },
      { actual: 5, rejected: 1 },
    ]),
    true,
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptedGrnQuantity,
  applyGrnLineEntryUnit,
  applyGrnLinePriceUnit,
  calculateGrnQuantities,
  combinePackLooseQuantity,
  createEditableGrnLine,
  deliveredGrnQuantity,
  formatPackLooseQuantity,
  grnLineBookTotal,
  grnLineHasPackLoose,
  hasAcceptedGrnQuantity,
  isLinkedPoApproved,
  isGrnLookupParam,
  patchGrnLineUnitPrice,
  splitPersistToPackLoose,
} from "../lib/inventory/grn-detail-model";

test("GRN quantity helpers preserve one accepted input plus rejected exception", () => {
  assert.equal(acceptedGrnQuantity(100, 20), 80);
  assert.equal(deliveredGrnQuantity(80, 20), 100);
});

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
      monetary: { unitCost: null },
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
    unitCost: 25000,
  });

  assert.equal(line.monetary?.unitPrice, 25000);
  assert.equal(line.costPending, false);
  assert.equal(patchGrnLineUnitPrice(line, 0).costPending, true);
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

test("GRN pack+loose round-trips through the persist (loose) unit", () => {
  assert.equal(combinePackLooseQuantity(9, 6, 24, 1), 222);
  assert.deepEqual(splitPersistToPackLoose(222, 24, 1), {
    packQty: 9,
    looseQty: 6,
  });
  assert.equal(
    formatPackLooseQuantity(9, "thùng", 6, "hộp"),
    "9 thùng + 6 hộp",
  );
});

test("GRN remaining in base allows partial pack+loose and over-receipt preview", () => {
  assert.deepEqual(
    calculateGrnQuantities(222, 0, 10, { persistToBase: 1, poToBase: 24 }),
    {
      acceptedQuantity: 222,
      poAppliedQuantity: 9.25,
      shortageQuantity: 0.75,
      excessQuantity: 0,
    },
  );
  assert.deepEqual(
    calculateGrnQuantities(246, 0, 10, { persistToBase: 1, poToBase: 24 }),
    {
      acceptedQuantity: 246,
      poAppliedQuantity: 10,
      shortageQuantity: 0,
      excessQuantity: 6,
    },
  );
  assert.deepEqual(calculateGrnQuantities(6, 0, 4), {
    acceptedQuantity: 6,
    poAppliedQuantity: 4,
    shortageQuantity: 0,
    excessQuantity: 2,
  });
  assert.deepEqual(
    calculateGrnQuantities(216, 0, 10, { persistToBase: 1, poToBase: 24 }),
    {
      acceptedQuantity: 216,
      poAppliedQuantity: 9,
      shortageQuantity: 1,
      excessQuantity: 0,
    },
  );
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

test("PO-first approved orders unlock GRN confirmation", () => {
  assert.equal(isLinkedPoApproved("approved"), true);
  assert.equal(isLinkedPoApproved("partially_received"), true);
  assert.equal(isLinkedPoApproved("pending_approval"), false);
  assert.equal(isLinkedPoApproved("changes_requested"), false);
});

test("changing GRN persist unit converts received quantity into the selected unit", () => {
  const units = [
    {
      id: 1,
      unit_id: 10,
      unit_code: "hop",
      unit_name: "hộp",
      to_base_factor: 1,
      is_base: true,
      is_active: true,
      sort_order: 0,
    },
    {
      id: 2,
      unit_id: 20,
      unit_code: "thung",
      unit_name: "thùng",
      to_base_factor: 24,
      is_base: false,
      is_active: true,
      sort_order: 1,
      anchor_unit_id: 10,
      anchor_factor: 24,
    },
  ];
  const line = createEditableGrnLine({
    lineId: 1,
    ingredient: {
      id: 4,
      name: "Gạo thơm",
      sku: "GAO-01",
      category: null,
      category_id: null,
      item_kind: "ingredient",
      monetary: { unitCost: null },
      min_stock_level: null,
      max_stock_level: null,
      reorder_point: null,
      storage_type: null,
      is_active: true,
      updated_at: null,
      units,
    },
    quantity: 24,
    entryUnitId: 10,
    unit: "hộp",
    supplierId: 3,
    supplierName: "NCC Gạo",
  });

  const next = applyGrnLineEntryUnit(line, units, 20);
  assert.equal(next?.entryUnitId, 20);
  assert.equal(next?.actual, 1);
  assert.equal(next?.rejected, 0);
  assert.equal(next?.unit, "thùng");
  assert.equal(next?.persistToBaseFactor, 24);
});

test("GRN carton quote on loose persist books converted value, not pack * qty", () => {
  const units = [
    {
      id: 1,
      unit_id: 10,
      unit_code: "hop",
      unit_name: "hộp",
      to_base_factor: 1,
      is_base: true,
      is_active: true,
      sort_order: 0,
    },
    {
      id: 2,
      unit_id: 20,
      unit_code: "thung",
      unit_name: "thùng",
      to_base_factor: 24,
      is_base: false,
      is_active: true,
      sort_order: 1,
      anchor_unit_id: 10,
      anchor_factor: 24,
    },
  ];
  assert.equal(grnLineBookTotal(246, 1, 24000, 24), 246000);
  assert.equal(grnLineBookTotal(246, 1, 24000, 1), 5_904_000);

  const line = createEditableGrnLine({
    lineId: 1,
    ingredient: {
      id: 4,
      name: "Gạo thơm",
      sku: "GAO-01",
      category: null,
      category_id: null,
      item_kind: "ingredient",
      monetary: { unitCost: null },
      min_stock_level: null,
      max_stock_level: null,
      reorder_point: null,
      storage_type: null,
      is_active: true,
      updated_at: null,
      units,
    },
    quantity: 246,
    entryUnitId: 10,
    unit: "hộp",
    supplierId: 3,
    supplierName: "NCC Gạo",
    unitCost: 24000,
  });

  assert.equal(line.unitCostUnitId, 20);
  assert.equal(line.unitCostUnitLabel, "thùng");
  assert.equal(line.unitCostToBaseFactor, 24);
  assert.equal(line.entryUnitId, 10);
  assert.equal(line.monetary?.unitPrice, 24000);
  assert.equal(line.monetary?.lineTotal, 246000);

  const afterPersistChange = applyGrnLineEntryUnit(line, units, 20);
  assert.equal(afterPersistChange?.actual, 10.25);
  assert.equal(afterPersistChange?.monetary?.unitPrice, 24000);
  assert.equal(afterPersistChange?.unitCostUnitId, undefined);
  assert.equal(
    grnLineBookTotal(
      afterPersistChange?.actual ?? 0,
      afterPersistChange?.persistToBaseFactor ?? 0,
      afterPersistChange?.monetary?.unitPrice ?? 0,
      line.unitCostToBaseFactor,
    ),
    246000,
  );

  const afterPriceUnit = applyGrnLinePriceUnit(line, units, 10);
  assert.equal(afterPriceUnit?.unitCostUnitId, 10);
  assert.equal(afterPriceUnit?.monetary?.unitPrice, 1000);
  assert.equal(afterPriceUnit?.monetary?.lineTotal, 246000);
});

test("patch GRN unit price keeps quote unit when persist qty is loose", () => {
  const patched = patchGrnLineUnitPrice(
    {
      actual: 246,
      rejected: 0,
      persistToBaseFactor: 1,
      unitCostToBaseFactor: 24,
    },
    24000,
  );
  assert.equal(patched.monetary?.unitPrice, 24000);
  assert.equal(patched.monetary?.lineTotal, 246000);
});

test("pack+loose qty split is only for persist in the loose unit", () => {
  const line = {
    packUnit: { unitId: 20, label: "thùng", toBaseFactor: 24 },
    looseUnit: { unitId: 10, label: "hộp", toBaseFactor: 1 },
    entryUnitId: 10,
  };
  assert.equal(grnLineHasPackLoose(line), true);
  assert.equal(grnLineHasPackLoose({ ...line, entryUnitId: 20 }), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeStockIngredientDetailStatus,
  stockMovementReferenceHref,
  type StockIngredientDetailMovement,
} from "../lib/inventory/stock-on-hand-detail-model";

function makeMovement(
  patch: Partial<StockIngredientDetailMovement> = {},
): StockIngredientDetailMovement {
  return {
    id: 1,
    type: "grn_receipt",
    movementSubtype: null,
    quantityChange: 1,
    unitCost: null,
    reason: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    grnId: 9,
    transferId: null,
    issueId: null,
    orderId: null,
    productionRunId: null,
    locationName: "Warehouse",
    locationCode: "WH",
    ...patch,
  };
}

test("ingredient detail status keeps depletion, threshold, and overstock order", () => {
  assert.equal(computeStockIngredientDetailStatus(0, 10, 15, 30), "out");
  assert.equal(computeStockIngredientDetailStatus(9, 10, 15, 30), "low");
  assert.equal(computeStockIngredientDetailStatus(15, 10, 15, 30), "low");
  assert.equal(computeStockIngredientDetailStatus(31, 10, 15, 30), "over");
  assert.equal(computeStockIngredientDetailStatus(20, 10, 15, 30), "normal");
});

test("ingredient detail movement links stay in the selected Branch stock plane", () => {
  const stockBasePath = "/br/3/stock";

  assert.equal(
    stockMovementReferenceHref({
      movement: makeMovement({ grnId: 44 }),
      branchId: 3,
      branchStockBasePath: stockBasePath,
    }),
    "/br/3/stock/grn/44",
  );
  assert.equal(
    stockMovementReferenceHref({
      movement: makeMovement({ grnId: null, transferId: 12 }),
      branchId: 3,
      branchStockBasePath: stockBasePath,
    }),
    "/br/3/stock/transfer/12",
  );
  assert.equal(
    stockMovementReferenceHref({
      movement: makeMovement({ grnId: null, issueId: 7 }),
      branchId: 3,
      branchStockBasePath: stockBasePath,
    }),
    "/br/3/stock/issues/7",
  );
});

test("Admin Dashboard movement links retain the management detail route", () => {
  assert.equal(
    stockMovementReferenceHref({
      movement: makeMovement({ grnId: 44 }),
      branchId: 3,
    }),
    "/inventory/grn/44",
  );
});

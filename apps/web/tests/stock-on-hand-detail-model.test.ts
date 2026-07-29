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

test("ingredient detail status uses the single minimum threshold", () => {
  assert.equal(computeStockIngredientDetailStatus(0, 10), "out");
  assert.equal(computeStockIngredientDetailStatus(9, 10), "low");
  assert.equal(computeStockIngredientDetailStatus(10, 10), "low");
  assert.equal(computeStockIngredientDetailStatus(11, 10), "normal");
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
    "/br/3/stock/transfer?transferId=12&mode=view",
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

test("Owner surface movement links retain the management detail route", () => {
  assert.equal(
    stockMovementReferenceHref({
      movement: makeMovement({ grnId: 44 }),
      branchId: 3,
    }),
    "/inventory/grn?grnId=44&mode=view",
  );
});

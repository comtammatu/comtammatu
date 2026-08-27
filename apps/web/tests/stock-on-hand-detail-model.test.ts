import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categorizeStockMovement,
  computeStockIngredientDetailStatus,
  countStockMovementsByCategory,
  filterStockMovements,
  stockDetailListedQuantity,
  stockDetailListedValue,
  stockMovementReferenceHref,
  type StockIngredientDetailLocation,
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
    monetary: null,
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

test("Owner surface movement links retain the management detail route", () => {
  assert.equal(
    stockMovementReferenceHref({
      movement: makeMovement({ grnId: 44 }),
      branchId: 3,
    }),
    "/inventory/grn?grnId=44&mode=view",
  );
});

function makeLocation(
  patch: Partial<StockIngredientDetailLocation>,
): StockIngredientDetailLocation {
  return {
    locationId: 1,
    name: "Kho",
    code: "WH",
    locationKind: "warehouse",
    qty: 0,
    monetary: null,
    lastCountedAt: null,
    ...patch,
  };
}

test("owner stock card header quantity sums visible system locations", () => {
  assert.equal(stockDetailListedQuantity(42, undefined), 42);
  assert.equal(
    stockDetailListedQuantity(18, [
      makeLocation({ locationId: 1, qty: 18 }),
      makeLocation({ locationId: 2, qty: 1.3 }),
      makeLocation({ locationId: 3, qty: 0 }),
    ]),
    19.3,
  );
});

test("owner stock card header value sums the same visible locations", () => {
  assert.equal(stockDetailListedValue(100, undefined), 100);
  assert.equal(
    stockDetailListedValue(100, [
      makeLocation({
        locationId: 1,
        qty: 10,
        monetary: { avgUnitCost: 2 },
      }),
      makeLocation({
        locationId: 2,
        qty: 5,
        monetary: { avgUnitCost: 4 },
      }),
    ]),
    40,
  );
});

test("categorizeStockMovement maps operation types to domain categories", () => {
  assert.equal(categorizeStockMovement(makeMovement({ type: "grn_receipt" })), "grn");
  assert.equal(categorizeStockMovement(makeMovement({ type: "transfer_in" })), "transfer");
  assert.equal(categorizeStockMovement(makeMovement({ type: "transfer_out" })), "transfer");
  assert.equal(categorizeStockMovement(makeMovement({ type: "consumption" })), "consumption");
  assert.equal(
    categorizeStockMovement(makeMovement({ type: "production_consumption" })),
    "consumption",
  );
  assert.equal(
    categorizeStockMovement(
      makeMovement({ type: "consumption", movementSubtype: "writeoff" }),
    ),
    "waste",
  );
  assert.equal(categorizeStockMovement(makeMovement({ type: "writeoff" })), "waste");
  assert.equal(
    categorizeStockMovement(makeMovement({ type: "count_adjustment" })),
    "adjustment",
  );
  assert.equal(
    categorizeStockMovement(makeMovement({ type: "adjustment" })),
    "adjustment",
  );
  assert.equal(
    categorizeStockMovement(makeMovement({ type: "production_output" })),
    "adjustment",
  );
});

test("filterStockMovements filters movements by category", () => {
  const movements: StockIngredientDetailMovement[] = [
    makeMovement({ id: 1, type: "grn_receipt" }),
    makeMovement({ id: 2, type: "consumption" }),
    makeMovement({ id: 3, type: "transfer_in" }),
    makeMovement({ id: 4, type: "writeoff" }),
    makeMovement({ id: 5, type: "count_adjustment" }),
  ];

  assert.equal(filterStockMovements(movements, "all").length, 5);
  assert.deepEqual(
    filterStockMovements(movements, "grn").map((m) => m.id),
    [1],
  );
  assert.deepEqual(
    filterStockMovements(movements, "consumption").map((m) => m.id),
    [2],
  );
  assert.deepEqual(
    filterStockMovements(movements, "transfer").map((m) => m.id),
    [3],
  );
  assert.deepEqual(
    filterStockMovements(movements, "waste").map((m) => m.id),
    [4],
  );
  assert.deepEqual(
    filterStockMovements(movements, "adjustment").map((m) => m.id),
    [5],
  );
});

test("countStockMovementsByCategory accurately counts movements in all categories", () => {
  const movements: StockIngredientDetailMovement[] = [
    makeMovement({ id: 1, type: "grn_receipt" }),
    makeMovement({ id: 2, type: "consumption" }),
    makeMovement({ id: 3, type: "production_consumption" }),
    makeMovement({ id: 4, type: "transfer_in" }),
    makeMovement({ id: 5, type: "transfer_out" }),
    makeMovement({ id: 6, type: "writeoff" }),
    makeMovement({ id: 7, type: "count_adjustment" }),
    makeMovement({ id: 8, type: "adjustment" }),
  ];

  const counts = countStockMovementsByCategory(movements);
  assert.equal(counts.all, 8);
  assert.equal(counts.grn, 1);
  assert.equal(counts.consumption, 2);
  assert.equal(counts.transfer, 2);
  assert.equal(counts.waste, 1);
  assert.equal(counts.adjustment, 2);
});


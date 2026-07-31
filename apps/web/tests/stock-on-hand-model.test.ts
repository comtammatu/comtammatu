import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STOCK_ALL_CATEGORY_VALUE,
  STOCK_NO_CATEGORY_VALUE,
  filterStockOnHandIngredients,
  hasStockOnHandFilters,
  isPristineStockOnHand,
  needsInventoryValuationRestore,
  type StockIngredient,
  type StockOnHandFilters,
} from "../lib/inventory/stock-on-hand-model";

function makeIngredient(patch: Partial<StockIngredient> = {}): StockIngredient {
  return {
    id: 1,
    name: "Rice",
    sku: "RICE-01",
    unit: "kg",
    category: "Dry",
    itemKind: "raw_material",
    qty: 10,
    monetary: { averageUnitCost: 20 },
    min: 2,
    max: 20,
    reorder: 4,
    status: "normal",
    lastCount: "01/07/2026",
    temp: null,
    locationBreakdown: [],
    ...patch,
  };
}

const defaultFilters: StockOnHandFilters = {
  category: STOCK_ALL_CATEGORY_VALUE,
  query: "",
  status: "all",
};

test("stock list sorts out and low ingredients before normal stock", () => {
  const rows = filterStockOnHandIngredients(
    [
      makeIngredient({ id: 1, name: "Rice" }),
      makeIngredient({ id: 2, name: "Oil", qty: 1, status: "low" }),
      makeIngredient({ id: 3, name: "Salt", qty: 0, status: "out" }),
    ],
    defaultFilters,
  );

  assert.deepEqual(
    rows.map((row) => row.id),
    [3, 2, 1],
  );
});

test("stock filters combine search, category, and minimum-threshold risk", () => {
  const rows = [
    makeIngredient({ id: 1, name: "Rice", category: "Dry" }),
    makeIngredient({
      id: 2,
      name: "Fish sauce",
      sku: "FISH-01",
      category: "Sauce",
      qty: 3,
      min: 5,
      status: "low",
    }),
    makeIngredient({ id: 3, name: "No category", category: "" }),
  ];

  assert.deepEqual(
    filterStockOnHandIngredients(rows, {
      ...defaultFilters,
      query: "fish",
      status: "low",
    }).map((row) => row.id),
    [2],
  );
  assert.deepEqual(
    filterStockOnHandIngredients(rows, {
      ...defaultFilters,
      category: STOCK_NO_CATEGORY_VALUE,
    }).map((row) => row.id),
    [3],
  );
});

test("pristine stock and active filter state remain distinct", () => {
  assert.equal(
    isPristineStockOnHand([
      makeIngredient({ qty: 0, status: "out", lastCount: "—" }),
    ]),
    true,
  );
  assert.equal(hasStockOnHandFilters(defaultFilters), false);
  assert.equal(hasStockOnHandFilters({ ...defaultFilters, status: "low" }), true);
});

test("valuation restore is offered only when every stocked ingredient lacks WAC", () => {
  assert.equal(
    needsInventoryValuationRestore([
      makeIngredient({ id: 1, monetary: { averageUnitCost: 0 } }),
      makeIngredient({ id: 2, monetary: { averageUnitCost: null } }),
      makeIngredient({ id: 3, qty: 0, monetary: { averageUnitCost: 20 } }),
    ]),
    true,
  );
  assert.equal(
    needsInventoryValuationRestore([
      makeIngredient({ id: 1, monetary: { averageUnitCost: 20 } }),
    ]),
    false,
  );
});

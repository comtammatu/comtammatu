import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STOCK_NO_CATEGORY_VALUE,
  STOCK_ON_HAND_DEFAULT_STATUS,
  filterStockOnHandIngredients,
  hasStockOnHandFilters,
  isPristineStockOnHand,
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
  categories: [],
  query: "",
  status: "all",
};

test("stock list sorts normal, then low, then out", () => {
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
    [1, 2, 3],
  );
});

test("in_stock hides out and keeps normal ahead of low", () => {
  const rows = filterStockOnHandIngredients(
    [
      makeIngredient({ id: 1, name: "Rice" }),
      makeIngredient({ id: 2, name: "Oil", qty: 1, status: "low" }),
      makeIngredient({ id: 3, name: "Salt", qty: 0, status: "out" }),
    ],
    { ...defaultFilters, status: "in_stock" },
  );

  assert.deepEqual(
    rows.map((row) => row.id),
    [1, 2],
  );
});

test("stock filters combine search, category, and exclusive status buckets", () => {
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
    makeIngredient({
      id: 4,
      name: "Fish oil",
      sku: "FISH-02",
      category: "Sauce",
      qty: 0,
      status: "out",
    }),
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
      status: "low",
    }).map((row) => row.id),
    [2],
  );
  assert.deepEqual(
    filterStockOnHandIngredients(rows, {
      ...defaultFilters,
      status: "out",
    }).map((row) => row.id),
    [4],
  );
  assert.deepEqual(
    filterStockOnHandIngredients(rows, {
      ...defaultFilters,
      categories: [STOCK_NO_CATEGORY_VALUE],
    }).map((row) => row.id),
    [3],
  );
  assert.deepEqual(
    filterStockOnHandIngredients(rows, {
      ...defaultFilters,
      categories: ["Dry", "Sauce"],
    }).map((row) => row.id),
    [1, 2, 4],
  );
});

test("pristine stock and active filter state remain distinct", () => {
  assert.equal(
    isPristineStockOnHand([
      makeIngredient({ qty: 0, status: "out", lastCount: "—" }),
    ]),
    true,
  );
  assert.equal(STOCK_ON_HAND_DEFAULT_STATUS, "in_stock");
  assert.equal(
    hasStockOnHandFilters({
      ...defaultFilters,
      status: STOCK_ON_HAND_DEFAULT_STATUS,
    }),
    false,
  );
  assert.equal(hasStockOnHandFilters(defaultFilters), true);
  assert.equal(hasStockOnHandFilters({ ...defaultFilters, status: "low" }), true);
  assert.equal(
    hasStockOnHandFilters({
      ...defaultFilters,
      status: STOCK_ON_HAND_DEFAULT_STATUS,
      categories: ["Dry"],
    }),
    true,
  );
});

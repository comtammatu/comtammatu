import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STOCK_ALL_CATEGORY_VALUE,
  STOCK_NO_CATEGORY_VALUE,
  filterStockOnHandIngredients,
  hasStockOnHandFilters,
  isPristineStockOnHand,
  scopeStockIngredientToLocation,
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
    cost: 20,
    referenceCost: 15,
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
  location: "all",
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

test("location scope recomputes quantity, status, and fallback cost", () => {
  const scoped = scopeStockIngredientToLocation(
    makeIngredient({
      min: 3,
      locationBreakdown: [
        {
          locationId: 10,
          name: "Warehouse",
          code: "WH",
          locationKind: "warehouse",
          qty: 2,
          avgUnitCost: null,
          lastCountedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          locationId: 20,
          name: "Kitchen",
          code: "KT",
          locationKind: "kitchen",
          qty: 8,
          avgUnitCost: 30,
          lastCountedAt: "2026-07-02T00:00:00.000Z",
        },
      ],
    }),
    "warehouse",
  );

  assert.equal(scoped.qty, 2);
  assert.equal(scoped.cost, 15);
  assert.equal(scoped.status, "low");
  assert.deepEqual(
    scoped.locationBreakdown?.map((row) => row.locationKind),
    ["warehouse"],
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
  assert.equal(
    hasStockOnHandFilters({ ...defaultFilters, location: "kitchen" }),
    true,
  );
});

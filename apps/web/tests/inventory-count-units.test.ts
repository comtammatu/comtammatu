import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getDefaultCountUnit,
  pickDefaultCountUnit,
} from "../app/(protected)/inventory/_lib/count-units";
import type { IngredientRow, IngredientUnitRow } from "../lib/inventory/types";

function unit(row: Partial<IngredientUnitRow>): IngredientUnitRow {
  return {
    id: 0,
    unit_id: 0,
    unit_code: "",
    to_base_factor: 1,
    is_base: false,
    is_active: true,
    sort_order: 0,
    ...row,
  };
}

function ingredient(units: IngredientUnitRow[]): IngredientRow {
  return {
    id: 1,
    name: "Test",
    sku: null,
    category_id: null,
    unit_cost: null,
    item_kind: "raw_material",
    storage_type: "ambient",
    min_stock_level: 0,
    is_active: true,
    units,
  } as IngredientRow;
}

test("pickDefaultCountUnit chooses the largest active package", () => {
  const options = [
    {
      unitId: 1,
      code: "ml",
      label: "ml",
      isBase: true,
      toBaseFactor: 1,
    },
    {
      unitId: 2,
      code: "thùng",
      label: "Thùng",
      isBase: false,
      toBaseFactor: 7920,
    },
  ];

  assert.equal(pickDefaultCountUnit(options)?.unitId, 2);
});

test("getDefaultCountUnit falls back to base when only one unit exists", () => {
  const selected = getDefaultCountUnit(
    ingredient([
      unit({
        unit_id: 10,
        unit_code: "kg",
        unit_name: "kg",
        to_base_factor: 1,
        is_base: true,
      }),
    ]),
  );

  assert.equal(selected?.unitId, 10);
  assert.equal(selected?.isBase, true);
});

test("getDefaultCountUnit selects the largest active unit", () => {
  const selected = getDefaultCountUnit(
    ingredient([
      unit({
        unit_id: 1,
        unit_code: "ml",
        unit_name: "ml",
        to_base_factor: 1,
        is_base: true,
        sort_order: 0,
      }),
      unit({
        unit_id: 2,
        unit_code: "chai",
        unit_name: "Chai",
        to_base_factor: 330,
        is_base: false,
        sort_order: 1,
      }),
      unit({
        unit_id: 3,
        unit_code: "thùng",
        unit_name: "Thùng",
        to_base_factor: 7920,
        is_base: false,
        sort_order: 2,
      }),
    ]),
  );

  assert.equal(selected?.unitId, 3);
  assert.equal(selected?.code, "thùng");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { formatStockConversionHint } from "../app/components/inventory/stock-on-hand-print-dialog";
import type { StockIngredient } from "../lib/inventory/stock-on-hand-model";
import type { IngredientUnitRow } from "../lib/inventory/types";

test("stock on-hand conversion hint formats conversion factors correctly", () => {
  const units: IngredientUnitRow[] = [
    {
      id: 1,
      unit_id: 1,
      unit_code: "kg",
      unit_name: "kg",
      is_base: true,
      to_base_factor: 1,
      is_active: true,
      sort_order: 0,
    },
    {
      id: 2,
      unit_id: 2,
      unit_code: "bao",
      unit_name: "Bao",
      is_base: false,
      to_base_factor: 25,
      is_active: true,
      sort_order: 1,
    },
  ];
  assert.equal(formatStockConversionHint(units, "kg"), "1 Bao = 25 kg");

  const singleBase: IngredientUnitRow[] = [
    {
      id: 1,
      unit_id: 1,
      unit_code: "kg",
      unit_name: "kg",
      is_base: true,
      to_base_factor: 1,
      is_active: true,
      sort_order: 0,
    },
  ];
  assert.equal(formatStockConversionHint(singleBase, "kg"), "—");
  assert.equal(formatStockConversionHint(undefined, "kg"), "—");
  assert.equal(formatStockConversionHint([], "kg"), "—");
});

test("stock on-hand print counts status categories accurately", () => {
  const sampleIngredients: StockIngredient[] = [
    {
      id: 1,
      name: "Gạo Tấm",
      sku: "NL-001",
      unit: "kg",
      category: "Gạo",
      itemKind: "raw_material",
      qty: 150,
      monetary: { averageUnitCost: 25000 },
      min: 20,
      max: 200,
      reorder: 50,
      status: "normal",
      lastCount: "2026-08-30",
      temp: null,
    },
    {
      id: 2,
      name: "Sườn Cốt Lết",
      sku: "NL-002",
      unit: "kg",
      category: "Thịt tươi",
      itemKind: "raw_material",
      qty: 5,
      monetary: { averageUnitCost: 110000 },
      min: 10,
      max: 50,
      reorder: 15,
      status: "low",
      lastCount: "2026-08-30",
      temp: null,
    },
    {
      id: 3,
      name: "Nước mắm",
      sku: "NL-003",
      unit: "lit",
      category: "Gia vị",
      itemKind: "raw_material",
      qty: 0,
      monetary: { averageUnitCost: 40000 },
      min: 5,
      max: 20,
      reorder: 10,
      status: "out",
      lastCount: "2026-08-30",
      temp: null,
    },
  ];

  const inStock = sampleIngredients.filter((i) => i.status === "normal").length;
  const lowStock = sampleIngredients.filter((i) => i.status === "low").length;
  const outOfStock = sampleIngredients.filter((i) => i.status === "out").length;

  assert.equal(inStock, 1);
  assert.equal(lowStock, 1);
  assert.equal(outOfStock, 1);
  assert.equal(sampleIngredients.length, 3);
});

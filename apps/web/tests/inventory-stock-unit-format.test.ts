import assert from "node:assert/strict";
import { test } from "node:test";
import { formatQty } from "../lib/inventory/format";
import { formatStockUnits } from "../app/(protected)/inventory/_lib/stock-unit-format";
import type { IngredientUnitRow } from "../lib/inventory/types";

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

// Plain formatter so the assertions stay independent of the vi-VN Intl
// output used in the app.
const plain = (n: number): string => String(Math.round(n * 1000) / 1000);

test("quantity formatter hides meaningless 3-digit decimal tails", () => {
  assert.equal(formatQty(300), "300");
  assert.equal(formatQty(300.0001), "300");
  assert.equal(formatQty(300.125), "300,125");
});

test("multi-unit stock decomposes greedily across the packaging ladder", () => {
  const units = [
    unit({ unit_code: "g", to_base_factor: 1, is_base: true }),
    unit({ unit_code: "kg", to_base_factor: 1000 }),
    unit({ unit_code: "cây", to_base_factor: 12000 }),
  ];

  const { big, base } = formatStockUnits(17000, units, plain);

  assert.equal(big, "1 cây + 5 kg");
  assert.equal(base, "17000 g");
});

test("two-unit stock shows whole packs plus base remainder", () => {
  const units = [
    unit({ unit_code: "lon", to_base_factor: 1, is_base: true }),
    unit({ unit_code: "thùng", to_base_factor: 24 }),
  ];

  const { big, base } = formatStockUnits(500, units, plain);

  assert.equal(big, "20 thùng + 20 lon");
  assert.equal(base, "500 lon");
});

test("three-unit ladder omits zero remainder base parts", () => {
  const units = [
    unit({ unit_code: "ml", to_base_factor: 1, is_base: true }),
    unit({ unit_code: "chai", to_base_factor: 250 }),
    unit({ unit_code: "thùng", to_base_factor: 5000 }),
  ];

  const { big, base } = formatStockUnits(18750, units, plain);

  assert.equal(big, "3 thùng + 15 chai");
  assert.equal(base, "18750 ml");
});

test("below one largest pack shows base only", () => {
  const units = [
    unit({ unit_code: "ml", to_base_factor: 1, is_base: true }),
    unit({ unit_code: "thùng", to_base_factor: 5000 }),
  ];

  const { big, base } = formatStockUnits(125, units, plain);

  assert.equal(big, null);
  assert.equal(base, "125 ml");
});

test("exact whole packs omit base remainder from the mixed line", () => {
  const units = [
    unit({ unit_code: "ml", to_base_factor: 1, is_base: true }),
    unit({ unit_code: "thùng", to_base_factor: 7920 }),
  ];

  const { big, base } = formatStockUnits(15840, units, plain);

  assert.equal(big, "2 thùng");
  assert.equal(base, "15840 ml");
});

test("single-unit ingredient renders base only (big is null)", () => {
  const units = [unit({ unit_code: "g", to_base_factor: 1, is_base: true })];

  const { big, base } = formatStockUnits(17000, units, plain);

  assert.equal(big, null);
  assert.equal(base, "17000 g");
});

test("missing units returns base with empty code and no big line", () => {
  const { big, base } = formatStockUnits(5, undefined, plain);

  assert.equal(big, null);
  assert.equal(base, "5");
});

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

const cocaUnits = [
  unit({ unit_code: "ml", to_base_factor: 1, is_base: true, sort_order: 0 }),
  unit({ unit_code: "lon", to_base_factor: 250, sort_order: 1 }),
  unit({ unit_code: "thùng", to_base_factor: 6000, sort_order: 2 }),
];

test("quantity formatter hides meaningless 3-digit decimal tails", () => {
  assert.equal(formatQty(300), "300");
  assert.equal(formatQty(300.0001), "300");
  assert.equal(formatQty(300.125), "300,125");
});

test("multi-unit stock promotes to largest whole packs (max two tiers)", () => {
  const units = [
    unit({ unit_code: "g", to_base_factor: 1, is_base: true }),
    unit({ unit_code: "kg", to_base_factor: 1000 }),
    unit({ unit_code: "cây", to_base_factor: 12000 }),
  ];

  const { big, base } = formatStockUnits(17000, units, plain);

  assert.equal(big, "1 cây 5 kg");
  assert.equal(base, "17000 g");
});

test("below one largest pack shows the next whole unit", () => {
  const { big, base } = formatStockUnits(3750, cocaUnits, plain);

  assert.equal(big, "15 lon");
  assert.equal(base, "3750 ml");
});

test("two-tier compact line for mixed case and can stock", () => {
  const { big, base } = formatStockUnits(7500, cocaUnits, plain);

  assert.equal(big, "1 thùng 6 lon");
  assert.equal(base, "7500 ml");
});

test("leftover that is not a whole mid-pack folds into the ledger unit", () => {
  // 1 thùng + 1 lon + 123 ml → max two tiers → "1 thùng 373 ml"
  const { big, base } = formatStockUnits(6373, cocaUnits, plain);

  assert.equal(big, "1 thùng 373 ml");
  assert.equal(base, "6373 ml");
});

test("exact one largest pack shows that pack only", () => {
  const { big, base } = formatStockUnits(6000, cocaUnits, plain);

  assert.equal(big, "1 thùng");
  assert.equal(base, "6000 ml");
});

test("below one mid-pack stays ledger-only", () => {
  const units = [
    unit({ unit_code: "ml", to_base_factor: 1, is_base: true }),
    unit({ unit_code: "thùng", to_base_factor: 5000 }),
  ];

  const { big, base } = formatStockUnits(125, units, plain);

  assert.equal(big, null);
  assert.equal(base, "125 ml");
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

test("negative on-hand still promotes to whole packs", () => {
  const { big, base } = formatStockUnits(-7500, cocaUnits, plain);

  assert.equal(big, "-1 thùng -6 lon");
  assert.equal(base, "-7500 ml");
});

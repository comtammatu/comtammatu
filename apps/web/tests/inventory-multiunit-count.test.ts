import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineMultiUnitQuantities,
  decomposeBaseQuantityToUnits,
  formatMultiUnitBreakdown,
  normalizeCountUnitLadder,
  normalizeEnteredUnitValues,
  type CountUnitItem,
} from "../lib/inventory/multiunit-count";

const cocaUnits: CountUnitItem[] = [
  { unitId: 1, code: "ml", label: "ml", isBase: true, toBaseFactor: 1 },
  { unitId: 2, code: "lon", label: "Lon", isBase: false, toBaseFactor: 330 },
  { unitId: 3, code: "thùng", label: "Thùng", isBase: false, toBaseFactor: 7920 },
];

const beerUnitsLonBase: CountUnitItem[] = [
  { unitId: 10, code: "lon", label: "Lon", isBase: true, toBaseFactor: 1 },
  { unitId: 20, code: "thùng", label: "Thùng", isBase: false, toBaseFactor: 24 },
];

const singleUnitRice: CountUnitItem[] = [
  { unitId: 100, code: "kg", label: "kg", isBase: true, toBaseFactor: 1 },
];

test("normalizeCountUnitLadder orders units descending by toBaseFactor", () => {
  const ladder = normalizeCountUnitLadder(cocaUnits);
  assert.equal(ladder.length, 3);
  assert.equal(ladder[0]?.code, "thùng");
  assert.equal(ladder[1]?.code, "lon");
  assert.equal(ladder[2]?.code, "ml");
});

test("user example 1: entering 24 lon auto-converts to 1 thùng", () => {
  // 1 Thùng = 24 Lon (lon is base)
  const result = normalizeEnteredUnitValues(
    { 20: 0, 10: 24 },
    beerUnitsLonBase,
  );
  assert.equal(result.totalBaseQty, 24);
  assert.deepEqual(result.normalizedValues, { 20: 1, 10: 0 });
  assert.equal(result.formattedBreakdown, "1 Thùng");
});

test("user example 1 (ml base): entering 24 lon auto-converts to 1 thùng", () => {
  // 1 Lon = 330 ml, 1 Thùng = 24 Lon = 7920 ml
  const result = normalizeEnteredUnitValues(
    { 3: 0, 2: 24, 1: 0 },
    cocaUnits,
  );
  assert.equal(result.totalBaseQty, 7920);
  assert.deepEqual(result.normalizedValues, { 3: 1, 2: 0, 1: 0 });
  assert.equal(result.formattedBreakdown, "1 Thùng");
});

test("user example 2: entering 3 thùng and 28 lon auto-sums to 4 thùng 4 lon", () => {
  // 3 thùng + 28 lon = 3 * 24 + 28 = 100 lon = 4 thùng 4 lon
  const result = normalizeEnteredUnitValues(
    { 20: 3, 10: 28 },
    beerUnitsLonBase,
  );
  assert.equal(result.totalBaseQty, 100);
  assert.deepEqual(result.normalizedValues, { 20: 4, 10: 4 });
  assert.equal(result.formattedBreakdown, "4 Thùng + 4 Lon");
});

test("user example 2 (ml base): entering 3 thùng and 28 lon auto-sums to 4 thùng 4 lon", () => {
  // 3 * 7920 + 28 * 330 = 23760 + 9240 = 33000 ml
  // 33000 / 7920 = 4 thùng rem 1320 ml
  // 1320 / 330 = 4 lon
  const result = normalizeEnteredUnitValues(
    { 3: 3, 2: 28, 1: 0 },
    cocaUnits,
  );
  assert.equal(result.totalBaseQty, 33000);
  assert.deepEqual(result.normalizedValues, { 3: 4, 2: 4, 1: 0 });
  assert.equal(result.formattedBreakdown, "4 Thùng + 4 Lon");
});

test("3-tier cascade: entering 3 thùng, 27 lon, 660 ml sums to 4 thùng 4 lon", () => {
  // 3 thùng (23760) + 27 lon (8910) + 660 ml = 33330 ml
  // 33330 / 7920 = 4 thùng (31680), rem 1650 ml
  // 1650 / 330 = 5 lon
  const result = normalizeEnteredUnitValues(
    { 3: 3, 2: 27, 1: 660 },
    cocaUnits,
  );
  assert.equal(result.totalBaseQty, 33330);
  assert.deepEqual(result.normalizedValues, { 3: 4, 2: 5, 1: 0 });
  assert.equal(result.formattedBreakdown, "4 Thùng + 5 Lon");
});

test("single unit ingredient preserves exact count", () => {
  const result = normalizeEnteredUnitValues({ 100: 25.5 }, singleUnitRice);
  assert.equal(result.totalBaseQty, 25.5);
  assert.deepEqual(result.normalizedValues, { 100: 25.5 });
  assert.equal(result.formattedBreakdown, "25,5 kg");
});

test("formatMultiUnitBreakdown handles negative variance and zero", () => {
  assert.equal(
    formatMultiUnitBreakdown(0, beerUnitsLonBase),
    "0 Lon",
  );
  assert.equal(
    formatMultiUnitBreakdown(16, beerUnitsLonBase, { signed: true }),
    "+16 Lon",
  );
  assert.equal(
    formatMultiUnitBreakdown(-28, beerUnitsLonBase, { signed: true }),
    "−1 Thùng + 4 Lon",
  );
  assert.equal(
    formatMultiUnitBreakdown(33000, cocaUnits, { showBaseSecondary: true }),
    "4 Thùng + 4 Lon (33.000 ml)",
  );
});

test("decomposeBaseQuantityToUnits handles empty or edge inputs", () => {
  assert.deepEqual(decomposeBaseQuantityToUnits(0, cocaUnits), { 3: 0, 2: 0, 1: 0 });
  assert.deepEqual(decomposeBaseQuantityToUnits(100, []), {});
});

test("combineMultiUnitQuantities sums entered units into total base quantity", () => {
  assert.equal(combineMultiUnitQuantities({ 3: 2, 2: 5 }, cocaUnits), 2 * 7920 + 5 * 330);
  assert.equal(combineMultiUnitQuantities({}, cocaUnits), 0);
});

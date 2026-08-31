import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type StocktakePrintLine,
  type StocktakePrintSession,
  type StocktakeCountUnitOption,
  formatPackSpecification,
  getIngredientUnits,
  toQuantityUnitFormatRows,
  formatConversionHint,
} from "../app/components/inventory/stocktake-print-dialog";
import {
  formatQuantityInLargestUnits,
  formatQuantityUnitBreakdown,
} from "../lib/inventory/quantity-unit-format";
import { formatQty } from "../lib/inventory/format";

function calculateSummary(lines: StocktakePrintLine[]) {
  const matched = lines.filter(
    (l) =>
      l.variance === 0 ||
      (l.countedQuantity != null &&
        l.systemQuantity != null &&
        l.countedQuantity === l.systemQuantity),
  ).length;

  const variance = lines.filter((l) => {
    if (l.variance != null) return l.variance !== 0;
    if (l.countedQuantity != null && l.systemQuantity != null) {
      return l.countedQuantity !== l.systemQuantity;
    }
    return false;
  }).length;

  return { total: lines.length, matched, variance };
}

test("stocktake print session code prioritizes custom session number over default fallback", () => {
  const customSession: StocktakePrintSession = {
    id: 101,
    sessionNumber: "KK-Q3-2026",
    status: "in_progress",
  };
  assert.equal(
    customSession.sessionNumber?.trim() || `KK-${customSession.id}`,
    "KK-Q3-2026",
  );

  const defaultSession: StocktakePrintSession = {
    id: 102,
    sessionNumber: null,
    status: "completed",
  };
  assert.equal(
    defaultSession.sessionNumber?.trim() || `KK-${defaultSession.id}`,
    "KK-102",
  );
});

test("stocktake count unit conversion hint renders non-base package units cleanly", () => {
  const units: StocktakeCountUnitOption[] = [
    { unitId: 1, code: "kg", label: "kg", isBase: true, toBaseFactor: 1 },
    { unitId: 2, code: "bao", label: "Bao", isBase: false, toBaseFactor: 25 },
  ];
  assert.equal(formatConversionHint(units, "kg"), "1 Bao = 25 kg");

  const singleBaseUnit: StocktakeCountUnitOption[] = [
    { unitId: 1, code: "kg", label: "kg", isBase: true, toBaseFactor: 1 },
  ];
  assert.equal(formatConversionHint(singleBaseUnit, "kg"), "—");

  const multiUnits: StocktakeCountUnitOption[] = [
    { unitId: 10, code: "lon", label: "lon", isBase: true, toBaseFactor: 1 },
    { unitId: 11, code: "loc", label: "Lốc", isBase: false, toBaseFactor: 6 },
    { unitId: 12, code: "thung", label: "Thùng", isBase: false, toBaseFactor: 24 },
  ];
  assert.equal(
    formatConversionHint(multiUnits, "lon"),
    "1 Lốc = 6 lon, 1 Thùng = 24 lon",
  );
});

test("getIngredientUnits returns all stocking units sorted by factor descending", () => {
  const unitOptions: Record<number, StocktakeCountUnitOption[]> = {
    10: [
      { unitId: 1, code: "lon", label: "lon", isBase: true, toBaseFactor: 1 },
      { unitId: 2, code: "loc", label: "Lốc", isBase: false, toBaseFactor: 6 },
      { unitId: 3, code: "thung", label: "Thùng", isBase: false, toBaseFactor: 24 },
    ],
  };

  const units = getIngredientUnits(10, "lon", unitOptions);
  assert.equal(units.length, 3);
  assert.equal(units[0]?.label, "Thùng");
  assert.equal(units[1]?.label, "Lốc");
  assert.equal(units[2]?.label, "lon");

  const fallback = getIngredientUnits(99, "kg", unitOptions);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0]?.label, "kg");
  assert.equal(fallback[0]?.isBase, true);
});

test("formatPackSpecification displays all active package units and base unit fallback", () => {
  const multiUnits: StocktakeCountUnitOption[] = [
    { unitId: 1, code: "lon", label: "lon", isBase: true, toBaseFactor: 1 },
    { unitId: 2, code: "loc", label: "Lốc", isBase: false, toBaseFactor: 6 },
    { unitId: 3, code: "thung", label: "Thùng", isBase: false, toBaseFactor: 24 },
  ];
  assert.equal(
    formatPackSpecification(multiUnits, "lon"),
    "1 Lốc = 6 lon, 1 Thùng = 24 lon",
  );

  const singleUnit: StocktakeCountUnitOption[] = [
    { unitId: 1, code: "kg", label: "kg", isBase: true, toBaseFactor: 1 },
  ];
  assert.equal(formatPackSpecification(singleUnit, "kg"), "kg");
});

test("multi-unit reconciliation quantity breakdown formats cleanly", () => {
  const units: StocktakeCountUnitOption[] = [
    { unitId: 1, code: "lon", label: "lon", isBase: true, toBaseFactor: 1 },
    { unitId: 2, code: "loc", label: "Lốc", isBase: false, toBaseFactor: 6 },
    { unitId: 3, code: "thung", label: "Thùng", isBase: false, toBaseFactor: 24 },
  ];
  const fmtUnits = toQuantityUnitFormatRows(units, "lon");

  // 125 lon = 5 Thùng (120) + 0 Lốc + 5 lon
  const { big, base } = formatQuantityUnitBreakdown(125, fmtUnits, formatQty);
  assert.equal(big, "5 Thùng + 5 lon");
  assert.equal(base, "125 lon");

  const inLargest = formatQuantityInLargestUnits(125, fmtUnits, formatQty);
  assert.equal(inLargest, "5 Thùng 5 lon");
});

test("stocktake print summary correctly counts matched vs variance lines", () => {
  const sampleLines: StocktakePrintLine[] = [
    {
      id: 1,
      ingredientId: 10,
      ingredientName: "Gạo Tấm",
      unit: "kg",
      systemQuantity: 100,
      countedQuantity: 100,
      variance: 0,
    },
    {
      id: 2,
      ingredientId: 20,
      ingredientName: "Sườn Cốt Lết",
      unit: "kg",
      systemQuantity: 50,
      countedQuantity: 48,
      variance: -2,
    },
    {
      id: 3,
      ingredientId: 30,
      ingredientName: "Trứng Gà",
      unit: "quả",
      systemQuantity: 200,
      countedQuantity: 210,
      variance: 10,
    },
  ];

  const summary = calculateSummary(sampleLines);
  assert.equal(summary.total, 3);
  assert.equal(summary.matched, 1);
  assert.equal(summary.variance, 2);
});

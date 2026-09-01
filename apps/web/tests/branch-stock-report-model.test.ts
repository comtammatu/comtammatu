import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getBranchStockMovementActivityScore,
  getBranchStockMovementHighlights,
  getBranchStockVarianceExceptions,
  type BranchStockMovementSource,
  type BranchStockVarianceSource,
} from "../lib/inventory/branch-stock-report-model";

const varianceRows: BranchStockVarianceSource[] = [
  {
    ingredient_id: 1,
    ingredient_name: "Gạo",
    unit: "kg",
    theoretical: 10,
    actual: 11,
    variance: 1,
    variance_pct: 10,
    flag: "warning",
  },
  {
    ingredient_id: 2,
    ingredient_name: "Nước mắm",
    unit: "lít",
    theoretical: 2,
    actual: 2.5,
    variance: 0.5,
    variance_pct: 25,
    flag: "critical",
  },
  {
    ingredient_id: 3,
    ingredient_name: "Hành",
    unit: "kg",
    theoretical: 4,
    actual: 4,
    variance: 0,
    variance_pct: 0,
    flag: "ok",
  },
];

const movementRows: BranchStockMovementSource[] = [
  {
    ingredient_id: 1,
    ingredient_name: "Gạo",
    unit: "kg",
    opening: 12,
    grn_receipt: 8,
    transfer_in: 0,
    transfer_out: -1,
    intra_transfer_in: 2,
    intra_transfer_out: -2,
    consumption: -3,
    production_consumption: 0,
    production_output: 0,
    adjustment: 0,
    closing: 16,
  },
  {
    ingredient_id: 2,
    ingredient_name: "Nước mắm",
    unit: "lít",
    opening: 5,
    grn_receipt: 0,
    transfer_in: 0,
    transfer_out: 0,
    intra_transfer_in: 0,
    intra_transfer_out: 0,
    consumption: -2,
    production_consumption: 0,
    production_output: 0,
    adjustment: 0,
    closing: 3,
  },
  {
    ingredient_id: 3,
    ingredient_name: "Hành",
    unit: "kg",
    opening: 4,
    grn_receipt: 0,
    transfer_in: 0,
    transfer_out: 0,
    intra_transfer_in: 0,
    intra_transfer_out: 0,
    consumption: 0,
    production_consumption: 0,
    production_output: 0,
    adjustment: 0,
    closing: 4,
  },
];

test("Branch report exposes only warning and critical variance with its source unit", () => {
  assert.deepEqual(
    getBranchStockVarianceExceptions(varianceRows).map((row) => ({
      ingredientName: row.ingredientName,
      unit: row.unit,
      flag: row.flag,
    })),
    [
      { ingredientName: "Nước mắm", unit: "lít", flag: "critical" },
      { ingredientName: "Gạo", unit: "kg", flag: "warning" },
    ],
  );
});

test("Branch report does not truncate warning or critical exceptions", () => {
  const exceptions = Array.from({ length: 9 }, (_, index) => ({
    ...varianceRows[0]!,
    ingredient_id: index + 10,
    ingredient_name: `Nguyên liệu ${index + 1}`,
  }));

  assert.equal(getBranchStockVarianceExceptions(exceptions).length, 9);
});

test("Branch report ranks movement per ingredient without cross-unit aggregation", () => {
  const highlights = getBranchStockMovementHighlights(movementRows);

  assert.deepEqual(
    highlights.map((row) => ({
      ingredientName: row.ingredientName,
      unit: row.unit,
      grnReceipt: row.grnReceipt,
      consumption: row.consumption,
    })),
    [
      {
        ingredientName: "Gạo",
        unit: "kg",
        grnReceipt: 8,
        consumption: -3,
      },
      {
        ingredientName: "Nước mắm",
        unit: "lít",
        grnReceipt: 0,
        consumption: -2,
      },
    ],
  );
  assert.equal(getBranchStockMovementActivityScore(highlights[0]!), 16);
  assert.equal(highlights[0]?.intraTransferIn, 2);
  assert.equal(highlights[0]?.intraTransferOut, -2);
});

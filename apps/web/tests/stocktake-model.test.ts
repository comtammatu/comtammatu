import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canCompleteBranchStocktake,
  getBranchStocktakeProgress,
  getBranchStocktakeVarianceTone,
  type BranchStocktakeLine,
} from "../lib/inventory/stocktake-model";

function makeLine(
  patch: Partial<BranchStocktakeLine> = {},
): BranchStocktakeLine {
  return {
    id: 1,
    ingredientId: 2,
    ingredientName: "Gạo",
    unit: "kg",
    countedQuantity: 10,
    varianceReason: null,
    needsRecount: false,
    systemQuantity: 10,
    variance: 0,
    ...patch,
  };
}

test("stocktake progress clamps invalid counts before showing a touch summary", () => {
  assert.deepEqual(
    getBranchStocktakeProgress({ totalItems: 8, countedItems: 3 }),
    { total: 8, counted: 3, percent: 38 },
  );
  assert.deepEqual(
    getBranchStocktakeProgress({ totalItems: 3, countedItems: 9 }),
    { total: 3, counted: 3, percent: 100 },
  );
  assert.deepEqual(
    getBranchStocktakeProgress({ totalItems: 0, countedItems: 0 }),
    { total: 0, counted: 0, percent: 0 },
  );
});

test("stocktake completion stays blocked for missing or recount lines", () => {
  assert.equal(canCompleteBranchStocktake([makeLine()]), true);
  assert.equal(
    canCompleteBranchStocktake([makeLine({ countedQuantity: null })]),
    false,
  );
  assert.equal(
    canCompleteBranchStocktake([makeLine({ needsRecount: true })]),
    false,
  );
});

test("stocktake result tones only derive from completed result quantities", () => {
  assert.equal(
    getBranchStocktakeVarianceTone(
      makeLine({ systemQuantity: null, variance: null }),
    ),
    "default",
  );
  assert.equal(
    getBranchStocktakeVarianceTone(makeLine({ variance: 0 })),
    "success",
  );
  assert.equal(
    getBranchStocktakeVarianceTone(makeLine({ variance: 0.3 })),
    "warning",
  );
  assert.equal(
    getBranchStocktakeVarianceTone(makeLine({ variance: 1 })),
    "destructive",
  );
});

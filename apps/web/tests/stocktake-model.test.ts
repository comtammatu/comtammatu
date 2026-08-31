import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInitialStocktakeCounts,
  canCompleteBranchStocktake,
  getBranchStocktakeProgress,
  getBranchStocktakeVarianceTone,
  parseStocktakeDraftCounts,
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

test("stocktake draft parser restores only the active round", () => {
  const stored = {
    roundNo: 2,
    counts: {
      "17": { qty: 4.5, savedAt: "2026-08-31T12:00:00.000Z" },
      invalid: { qty: 3 },
      "18": { qty: Number.NaN },
    },
  };

  assert.deepEqual(parseStocktakeDraftCounts(stored, 2), {
    "17": { qty: 4.5, savedAt: "2026-08-31T12:00:00.000Z" },
  });
  assert.deepEqual(parseStocktakeDraftCounts(stored, 3), {});
  assert.deepEqual(parseStocktakeDraftCounts({ "17": { qty: 2 } }, 1), {
    "17": { qty: 2 },
  });
  assert.deepEqual(parseStocktakeDraftCounts({ "17": { qty: 2 } }, 2), {});
});

test("submitted counts override drafts and drafts restore unsubmitted current-round lines", () => {
  const counts = buildInitialStocktakeCounts(
    [
      {
        ingredientId: 17,
        roundNo: 2,
        countedQuantity: 3,
        countedAt: "2026-08-31T11:00:00.000Z",
      },
      {
        ingredientId: 18,
        roundNo: 2,
        countedQuantity: null,
      },
      {
        ingredientId: 19,
        roundNo: 1,
        countedQuantity: 8,
      },
    ],
    2,
    {
      "17": { qty: 4.5 },
      "18": { qty: 7 },
      "99": { qty: 10 },
    },
  );

  assert.deepEqual(counts, {
    "17": { qty: 3, savedAt: "2026-08-31T11:00:00.000Z" },
    "18": { qty: 7 },
  });
});

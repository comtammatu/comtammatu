import assert from "node:assert/strict";
import { test } from "node:test";
import { purchaseDemandLineProgress } from "../lib/inventory/purchase-demand-progress";

test("purchase demand progress converts receipt-unit PO qty into demand unit", () => {
  const progress = purchaseDemandLineProgress({
    demandQuantity: 200,
    demandToBaseFactor: 1,
    orderedLines: [{ quantity: 2, entryToBaseFactor: 100 }],
  });

  assert.equal(progress.orderedQuantity, 200);
  assert.equal(progress.remainingQuantity, 0);
});

test("purchase demand progress stays zero-ordered when PO factors are missing", () => {
  const progress = purchaseDemandLineProgress({
    demandQuantity: 10,
    demandToBaseFactor: 1,
    orderedLines: [{ quantity: 2, entryToBaseFactor: 0 }],
  });

  assert.equal(progress.orderedQuantity, 0);
  assert.equal(progress.remainingQuantity, 10);
});

test("purchase demand progress supports partial coverage across mixed units", () => {
  const progress = purchaseDemandLineProgress({
    demandQuantity: 5,
    demandToBaseFactor: 100,
    orderedLines: [{ quantity: 2, entryToBaseFactor: 100 }],
  });

  assert.equal(progress.orderedQuantity, 2);
  assert.equal(progress.remainingQuantity, 3);
});
